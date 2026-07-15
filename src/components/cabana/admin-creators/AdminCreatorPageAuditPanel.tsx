import { History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/cabana/EmptyState";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import type { AdminCreatorPageAuditItem } from "@/lib/cabana-admin-creator-page-detail";

function actionLabel(action: string): string {
  return action
    .replace(/^creator_(page|link)\./, "")
    .replace(/[._]/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function changedKeys(item: AdminCreatorPageAuditItem): string[] {
  return [...new Set([...Object.keys(item.before), ...Object.keys(item.after)])].sort();
}

export function AdminCreatorPageAuditPanel({
  items,
  pending,
  error,
  onRetry,
}: {
  items: readonly AdminCreatorPageAuditItem[];
  pending: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="glass-strong space-y-4 rounded-3xl p-5" aria-labelledby="audit-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="audit-title" className="font-display text-lg font-semibold">
            Creator-page audit history
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest 50 relevant page and link changes. Database visibility policy remains
            authoritative.
          </p>
        </div>
        <Button
          type="button"
          variant="toolbar"
          size="icon"
          onClick={onRetry}
          aria-label="Refresh audit history"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error ? (
        <QueryErrorState
          title="Couldn’t load audit history"
          message="No audit entries are shown because the bounded query failed."
          onRetry={onRetry}
        />
      ) : pending && items.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading audit history">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          title="No creator-page audit entries"
          description="Successful admin page and link changes will appear here."
          className="!py-6"
        />
      ) : (
        <ol className="space-y-2">
          {items.map((item) => {
            const fields = changedKeys(item);
            return (
              <li key={item.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{actionLabel(item.action)}</p>
                  <time dateTime={item.createdAt} className="text-[10px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {item.actorRole} · {item.targetType}
                  {fields.length > 0 ? ` · ${fields.join(", ")}` : ""}
                </p>
                {item.reason ? (
                  <p className="mt-2 text-xs text-foreground/80">Reason: {item.reason}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
