import { Link } from "@tanstack/react-router";
import { Crown, Lock, Sparkles } from "lucide-react";
import type { PostVisibility } from "@/lib/cabana-posts";

/**
 * Tease shown in place of a followers/subscribers-only post the viewer can't
 * see. Followers posts offer a Follow CTA; subscribers posts link to the
 * creator page to subscribe.
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
  return (
    <div className="glass-strong flex flex-col items-center gap-3 rounded-2xl px-6 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
        {subscribers ? (
          <Crown className="h-4 w-4 text-iridescent" />
        ) : (
          <Lock className="h-4 w-4 text-sky-300/90" />
        )}
      </span>
      <div>
        <p className="text-sm font-medium">
          {subscribers ? "Subscribers-only post" : "Followers-only post"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {subscribers
            ? "Subscribe to this creator to see this content."
            : "Follow this creator to see this content."}
        </p>
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
            {pending ? "Updating…" : "Follow to unlock"}
            {!pending && <Sparkles className="h-3.5 w-3.5" />}
          </button>
        )
      )}
    </div>
  );
}
