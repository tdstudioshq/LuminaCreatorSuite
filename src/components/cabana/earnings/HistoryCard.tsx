import { Loader2, Receipt, type LucideIcon } from "lucide-react";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { EmptyState } from "@/components/cabana/EmptyState";

/** Shared chrome + loading/error/empty states for the earnings history lists. */
export function HistoryCard({
  title,
  count,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyLabel,
  emptyIcon = Receipt,
  children,
}: {
  title: string;
  count?: number;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isEmpty: boolean;
  emptyLabel: string;
  emptyIcon?: LucideIcon;
  children: React.ReactNode;
}) {
  // Split the "Heading. Optional hint." label into the standardized title + description.
  const [emptyHead, ...emptyTail] = emptyLabel.split(". ");
  const emptyTitle = emptyHead.replace(/\.$/, "");
  const emptyDescription = emptyTail.length ? emptyTail.join(". ") : undefined;
  return (
    <section className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {typeof count === "number" && !isLoading && !isError && (
          <span className="text-xs text-muted-foreground">{count} records</span>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <div className="px-6 py-6">
          <QueryErrorState title="Couldn’t load this history" onRetry={onRetry} />
        </div>
      ) : isEmpty ? (
        <div className="px-6 py-8">
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            className="border-0 bg-transparent py-2"
          />
        </div>
      ) : (
        children
      )}
    </section>
  );
}
