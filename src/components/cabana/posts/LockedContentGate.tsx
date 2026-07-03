import { Link } from "@tanstack/react-router";
import { Crown, Lock, Sparkles, Unlock } from "lucide-react";
import type { PostVisibility } from "@/lib/cabana-posts";

const LOCKED_CONTENT_TILES = [0, 1, 2, 3, 4, 5] as const;

/**
 * Tease shown in place of a restricted post the viewer can't see.
 *   - followers: a Follow CTA (via onUnlock)
 *   - subscribers: links to the creator page to subscribe
 *   - purchase: a one-time (mock) unlock CTA (via onUnlock)
 */
export function LockedContentGate({
  visibility,
  username,
  onUnlock,
  pending = false,
}: {
  visibility: PostVisibility;
  username: string;
  onUnlock?: () => void;
  pending?: boolean;
}) {
  const subscribers = visibility === "subscribers";
  const purchase = visibility === "purchase";

  const icon = subscribers ? (
    <Crown className="h-5 w-5 text-iridescent" />
  ) : purchase ? (
    <Unlock className="h-5 w-5 text-emerald-300/90" />
  ) : (
    <Lock className="h-5 w-5 text-sky-300/90" />
  );

  const title = subscribers
    ? "Subscribers-only post"
    : purchase
      ? "Paid post"
      : "Followers-only post";

  const description = subscribers
    ? "Subscribe to this creator to see this content."
    : purchase
      ? "Unlock this post with a one-time purchase."
      : "Follow this creator to see this content.";

  return (
    <div className="relative isolate flex min-h-64 flex-col items-center justify-center gap-4 overflow-hidden rounded-[24px] border border-white/[0.09] px-6 py-9 text-center shadow-[inset_0_1px_0_oklch(1_0_0/0.08)]">
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(145deg,oklch(0.22_0.03_280/0.75),oklch(0.13_0.015_280/0.9))]" />
      <div className="absolute -left-10 top-0 -z-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -right-8 bottom-0 -z-10 h-44 w-44 rounded-full bg-iridescent opacity-15 blur-3xl" />
      <div
        className="absolute inset-4 -z-10 grid grid-cols-3 gap-2 opacity-25 blur-[7px]"
        aria-hidden
      >
        {LOCKED_CONTENT_TILES.map((tile) => (
          <span key={tile} className="rounded-xl bg-gradient-to-br from-white/20 to-white/[0.03]" />
        ))}
      </div>
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.1] bg-black/30 shadow-[inset_0_1px_0_oklch(1_0_0/0.1)] backdrop-blur-xl">
        {icon}
      </span>
      <div className="max-w-sm">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Restricted content
        </p>
        <p className="mt-1.5 font-display text-lg font-semibold">{title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>

      {subscribers ? (
        <Link
          to="/$username"
          params={{ username }}
          className="btn-luxury min-h-10 !rounded-full !px-5 !py-2.5 text-xs"
        >
          Subscribe to unlock <Crown className="h-3.5 w-3.5" />
        </Link>
      ) : (
        onUnlock && (
          <button
            type="button"
            onClick={onUnlock}
            disabled={pending}
            className="btn-luxury min-h-10 !rounded-full !px-5 !py-2.5 text-xs disabled:opacity-60"
          >
            {pending ? "Updating…" : purchase ? "Unlock this post" : "Follow to unlock"}
            {!pending && <Sparkles className="h-3.5 w-3.5" />}
          </button>
        )
      )}

      {purchase && (
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Demo Mode — No real payment is processed.
        </p>
      )}
    </div>
  );
}
