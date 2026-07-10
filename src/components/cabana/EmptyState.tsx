import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The single, reusable empty-state pattern for CABANA surfaces (Batch 2 audit).
 * A muted lucide icon in a glass chip, a concise title, an optional one-line
 * explanation, and an optional contextual CTA directly beneath the message —
 * compact (no excessive whitespace), within the existing dark/glass language.
 *
 * Use for success-with-zero-rows states. For FAILED queries use QueryErrorState
 * instead (never render fake data on error).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** A contextual CTA rendered directly beneath the message. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-3xl border border-dashed border-border/60 bg-foreground/[0.02] px-6 py-9 text-center ${className}`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
