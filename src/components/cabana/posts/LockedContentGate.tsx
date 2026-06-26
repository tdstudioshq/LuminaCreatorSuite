import { Lock, Sparkles } from "lucide-react";

/**
 * Tease shown in place of a followers-only post that the current viewer can't
 * see. The optional CTA follows the creator to unlock.
 */
export function LockedContentGate({
  onUnlock,
  pending = false,
  ctaLabel = "Follow to unlock",
}: {
  onUnlock?: () => void;
  pending?: boolean;
  ctaLabel?: string;
}) {
  return (
    <div className="glass-strong flex flex-col items-center gap-3 rounded-2xl px-6 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
        <Lock className="h-4 w-4 text-sky-300/90" />
      </span>
      <div>
        <p className="text-sm font-medium">Followers-only post</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Follow this creator to see this content.
        </p>
      </div>
      {onUnlock && (
        <button
          onClick={onUnlock}
          disabled={pending}
          className="btn-luxury !px-5 !py-2.5 text-xs disabled:opacity-60"
        >
          {pending ? "Updating…" : ctaLabel}
          {!pending && <Sparkles className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
