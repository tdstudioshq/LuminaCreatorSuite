import { Link } from "@tanstack/react-router";
import { Crown, Lock, Sparkles, Unlock } from "lucide-react";
import type { PostVisibility } from "@/lib/cabana-posts";

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
    <Crown className="h-4 w-4 text-iridescent" />
  ) : purchase ? (
    <Unlock className="h-4 w-4 text-emerald-300/90" />
  ) : (
    <Lock className="h-4 w-4 text-sky-300/90" />
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
    <div className="glass-strong flex flex-col items-center gap-3 rounded-2xl px-6 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      {subscribers ? (
        <Link to="/$username" params={{ username }} className="btn-luxury !px-5 !py-2.5 text-xs">
          Subscribe to unlock <Crown className="h-3.5 w-3.5" />
        </Link>
      ) : (
        onUnlock && (
          <button
            onClick={onUnlock}
            disabled={pending}
            className="btn-luxury !px-5 !py-2.5 text-xs disabled:opacity-60"
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
