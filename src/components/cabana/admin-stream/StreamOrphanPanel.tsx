// Admin surface for the Stream orphan sweep.
//
// Report-first by construction: the panel can only reclaim what a dry run has
// already listed on screen, so an admin never triggers a destructive pass
// against an unseen set. The button label carries the exact count for the same
// reason. Every gate that matters is server-side (assertAdmin on both actions);
// this is UX.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/cabana/EmptyState";
import {
  type SweepReport,
  getStreamOrphanReport,
  sweepStreamOrphans,
} from "@/lib/stream-reconcile-actions";
import { orphanReasonLabel } from "@/lib/cabana-stream";

export function StreamOrphanPanel() {
  const [report, setReport] = useState<SweepReport | null>(null);

  const preview = useMutation({
    mutationFn: () => getStreamOrphanReport({ data: { limit: 200 } }),
    onSuccess: setReport,
    onError: (error: Error) => toast.error(error.message),
  });

  const sweep = useMutation({
    mutationFn: () => sweepStreamOrphans({ data: { limit: 200, dryRun: false } }),
    onSuccess: (result) => {
      setReport(result);
      toast.success(
        result.failed > 0
          ? `Reclaimed ${result.reclaimed}; ${result.failed} failed and will retry on the next sweep.`
          : `Reclaimed ${result.reclaimed} video${result.reclaimed === 1 ? "" : "s"}.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = preview.isPending || sweep.isPending;
  const candidates = report?.candidates ?? [];

  return (
    <div className="space-y-5">
      <div className="glass-strong rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-semibold">Unreferenced Cloudflare assets</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Finds videos CABANA created that no post references and whose grace period has
              elapsed: expired upload tickets, abandoned uploads, failed encodes, and finished
              uploads never composed into a post. Only assets tracked by a CABANA upload session are
              ever considered — the sweep never enumerates the Cloudflare account, so an asset with
              no local record is left alone rather than guessed at.
            </p>
          </div>
          <button
            type="button"
            onClick={() => preview.mutate()}
            disabled={busy}
            className="btn-ghost shrink-0 text-xs"
          >
            {preview.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {report ? "Refresh report" : "Preview orphans"}
          </button>
        </div>
      </div>

      {report === null ? (
        <EmptyState
          icon={Video}
          title="No report yet"
          description="Run a preview to see what a sweep would reclaim. Previewing is read-only."
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={Video}
          title="Nothing to reclaim"
          description={`Scanned ${report.scanned} tracked video${report.scanned === 1 ? "" : "s"}; none are orphaned past their grace period.`}
        />
      ) : (
        <div className="space-y-4">
          <div className="glass-strong overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Video</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.streamVideoId} className="border-b border-white/[0.04]">
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {candidate.streamVideoId}
                      </td>
                      <td className="px-4 py-3">{orphanReasonLabel(candidate.reason)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(candidate.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
            <p className="flex items-start gap-2 text-xs text-amber-200/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Deleting is permanent: the Cloudflare asset and its local record both go. Videos still
              attached to a post are never included.
            </p>
            <button
              type="button"
              onClick={() => sweep.mutate()}
              disabled={busy}
              className="btn-luxury shrink-0 !px-4 !py-2 text-xs"
            >
              {sweep.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Reclaim {candidates.length} video{candidates.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
