import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Compact inline error card for failed queries — mirrors the dashboard error
 * visual language so list/stat surfaces never render failures as fake data.
 */
export function QueryErrorState({
  title = "Couldn’t load this data",
  message,
  onRetry,
  className = "",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`glass flex flex-col items-center gap-3 rounded-2xl p-6 text-center ${className}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {message || "Something went wrong while fetching your data. Please try again."}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={() => onRetry()}
          className="btn-ghost inline-flex items-center gap-2 !px-3 !py-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
