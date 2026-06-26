import { Loader2 } from "lucide-react";

/** Shared chrome + loading/empty states for the earnings history lists. */
export function HistoryCard({
  title,
  count,
  isLoading,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  count?: number;
  isLoading: boolean;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {typeof count === "number" && !isLoading && (
          <span className="text-xs text-muted-foreground">{count} records</span>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isEmpty ? (
        <p className="px-6 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        children
      )}
    </section>
  );
}
