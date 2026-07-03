import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MessageCircleMore, Sparkles } from "lucide-react";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { ConversationListPane } from "./ConversationListPane";

/**
 * Two-pane messages layout (inside the social shell's left nav):
 * middle = conversation list, right = active thread or empty state.
 *
 * Responsive: when a thread is active the list hides below `md` (thread takes
 * over); with no active thread the list is full-width on mobile and the detail
 * pane shows only from `md` up. Structure-only — existing theme preserved.
 */
export function MessagesShell({ activeId, children }: { activeId?: string; children: ReactNode }) {
  const hasActive = !!activeId;
  return (
    <SocialShell rightRail={null} wide>
      <div className="flex h-[calc(100dvh-5rem)] overflow-hidden border-r border-white/[0.07] bg-[oklch(0.115_0.012_280/0.54)] lg:h-screen">
        <div
          className={`${hasActive ? "hidden md:flex" : "flex"} w-full flex-col border-r border-white/[0.07] md:w-[370px] md:shrink-0`}
        >
          <ConversationListPane activeId={activeId} />
        </div>
        <section
          className={`${hasActive ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,oklch(0.65_0.18_280/0.08),transparent_42%)]`}
        >
          {children}
        </section>
      </div>
    </SocialShell>
  );
}

/** Empty detail pane shown on /messages when no thread is selected. */
export function EmptyThread() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-10 text-center">
      <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-iridescent opacity-[0.07] blur-[100px]" />
      <span className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-[26px] border border-white/[0.12] bg-white/[0.055] shadow-[inset_0_1px_0_oklch(1_0_0/0.12),0_30px_80px_-40px_oklch(0.78_0.18_280/0.8)]">
        <MessageCircleMore className="h-8 w-8 text-primary" />
      </span>
      <p className="relative font-display text-2xl font-semibold text-foreground">
        Select a conversation
      </p>
      <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Choose a thread from your inbox to continue the conversation, or discover someone new.
      </p>
      <Link to="/explore" className="btn-luxury relative mt-6 !rounded-full !px-5 !py-2.5 text-xs">
        <Sparkles className="h-3.5 w-3.5" />
        Find creators
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
