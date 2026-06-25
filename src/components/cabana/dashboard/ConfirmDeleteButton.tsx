import { useEffect, useState } from "react";
import { Check, Trash2, X } from "lucide-react";

/**
 * A delete control with an inline two-step confirmation. The first click "arms"
 * the button (revealing confirm/cancel); the second confirms. Auto-disarms after
 * a few seconds so a stray click never leaves it primed. On-brand, no modal.
 */
export function ConfirmDeleteButton({
  onConfirm,
  idleLabel = "Delete",
  idleClassName,
  children,
}: {
  onConfirm: () => void;
  idleLabel?: string;
  idleClassName?: string;
  children?: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/30"
          aria-label="Confirm delete"
        >
          <Check className="h-3.5 w-3.5" /> Delete?
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Cancel delete"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      className={idleClassName}
      aria-label={idleLabel}
    >
      {children ?? <Trash2 className="h-4 w-4" />}
    </button>
  );
}
