// ============================================================================
// CABANA — creator video upload card (Checkpoint 5A.3)
// ----------------------------------------------------------------------------
// PRESENTATION ONLY. Every decision — which controls are live, what each phase
// says, whether a cancel is settled, whether publishing is blocked — comes from
// the pure `cabana-composer-media` policy module. This component owns no upload
// state, imports no transport (`tus-js-client` lives ONLY in stream-tus-client),
// calls no Cloudflare API, and reads no secret.
//
// It also renders NO player: 5A.3 is upload-only. Playback (a signed,
// always-tokenized surface) is Checkpoint 5B.
// ============================================================================
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  type UploadTone,
  describeCleanupDebt,
  describeUploadPhase,
  describeUploadProgress,
  preflightRejectionCopy,
  readyRemovalBlockedReason,
  resolveVideoControls,
  uploadFileName,
} from "@/lib/cabana-composer-media";
import type { UploadPreflightRejectionReason, UploadSession } from "@/lib/cabana-stream-upload";

/** Every interactive target clears the 44×44 CSS-pixel minimum (BOTH axes —
 *  the icon size is 40×40, so width needs the floor as much as height). */
const TAP_TARGET = "min-h-11 min-w-11";

const TONE_ICON: Record<UploadTone, typeof Video> = {
  neutral: Video,
  progress: Loader2,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

const TONE_CLASS: Record<UploadTone, string> = {
  neutral: "bg-white/5 text-muted-foreground",
  progress: "bg-white/5 text-foreground",
  success: "bg-emerald-400/10 text-emerald-300",
  warning: "bg-amber-400/10 text-amber-300",
  danger: "bg-red-400/10 text-red-300",
};

export type VideoUploadCardProps = {
  session: UploadSession;
  /** A local file rejection (bad type/size/duration) — pre-ticket, never a server error. */
  rejection: { reason: UploadPreflightRejectionReason } | null;
  onChooseFile: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onRemove: () => void;
  /** Detach an attached video server-side, then clear the session (5A.4). */
  onDetach: () => void;
  /** True while the detach round-trip is in flight. */
  detaching?: boolean;
  /** Leave video mode entirely (only offered while nothing is in flight). */
  onDismiss: () => void;
};

export function VideoUploadCard({
  session,
  rejection,
  onChooseFile,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onRemove,
  onDetach,
  detaching = false,
  onDismiss,
}: VideoUploadCardProps) {
  const phase = describeUploadPhase(session);
  const controls = resolveVideoControls(session);
  const progress = describeUploadProgress(session);
  const debt = describeCleanupDebt(session);
  const fileName = uploadFileName(session);
  const readyBlockedReason = readyRemovalBlockedReason(session);
  const Icon = TONE_ICON[phase.tone];
  const showProgress = progress.label.length > 0;

  return (
    <section
      aria-label="Video upload"
      data-phase={phase.key}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[phase.tone]}`}
        >
          <Icon className={`h-5 w-5 ${phase.busy ? "animate-spin" : ""}`} />
        </span>

        {/* Single polite live region: phase changes and failures are announced
            without stealing focus. aria-atomic so the whole status reads out. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1">
          <p className="text-sm font-medium">{phase.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{phase.detail}</p>
          {fileName !== null && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground/80" title={fileName}>
              {fileName}
            </p>
          )}
          {showProgress && (
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{progress.label}</p>
          )}
        </div>

        {session.phase === "idle" && (
          <Button
            variant="icon"
            size="icon"
            onClick={onDismiss}
            aria-label="Cancel adding a video"
            className={TAP_TARGET}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showProgress && (
        <Progress
          value={progress.percent}
          aria-label="Video upload progress"
          aria-valuetext={progress.label}
          className="h-1.5"
        />
      )}

      {rejection !== null && (
        <p role="alert" className="rounded-xl bg-red-400/10 px-3 py-2 text-[11px] text-red-200">
          {preflightRejectionCopy(rejection.reason)}
        </p>
      )}

      {debt.blockedReason !== null && (
        <p className="rounded-xl bg-red-400/10 px-3 py-2 text-[11px] leading-relaxed text-red-200">
          {debt.blockedReason}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {controls.canChooseFile && (
          <Button variant="secondary" size="sm" onClick={onChooseFile} className={TAP_TARGET}>
            <Upload className="h-4 w-4" /> Choose video
          </Button>
        )}
        {controls.canPause && (
          <Button variant="ghost" size="sm" onClick={onPause} className={TAP_TARGET}>
            <Pause className="h-4 w-4" /> Pause
          </Button>
        )}
        {controls.canResume && (
          <Button variant="secondary" size="sm" onClick={onResume} className={TAP_TARGET}>
            <Play className="h-4 w-4" /> Resume
          </Button>
        )}
        {controls.canRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} className={TAP_TARGET}>
            <RotateCcw className="h-4 w-4" /> Retry
          </Button>
        )}
        {controls.canCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className={TAP_TARGET}>
            <X className="h-4 w-4" /> Cancel upload
          </Button>
        )}
        {session.phase === "canceled" && !controls.canDetach && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={!controls.canRemove}
            title={controls.canRemove ? undefined : "Waiting for the canceled video to be removed."}
            className={TAP_TARGET}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        )}
        {/* An attached video (ready, or a cancel that left post_media behind) is
            removed through the server: detach the row, then reclaim the asset.
            The title warns that this deletes the upload — destructive, and the
            creator should not learn that afterwards. */}
        {controls.canDetach && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDetach}
            disabled={detaching}
            title={readyBlockedReason ?? "Removing this video also deletes the uploaded file."}
            className={TAP_TARGET}
          >
            {detaching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {detaching ? "Removing…" : "Remove video"}
          </Button>
        )}
      </div>
    </section>
  );
}
