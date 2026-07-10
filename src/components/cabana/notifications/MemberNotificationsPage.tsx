import { Bell, Loader2 } from "lucide-react";
import { FoundationPage } from "@/components/cabana/foundation/FoundationPage";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { useAuthSession } from "@/lib/cabana-auth";
import { NotificationsCenter } from "./NotificationsCenter";
import { NotificationSettings } from "./NotificationSettings";

const capabilities = [
  "Member subscription, post, message, and system activity",
  "Read and unread state with live updates",
  "Entity-aware notifications",
  "Email/push delivery is a future, opt-in pipeline",
] as const;

/**
 * Public `/notifications` entry. Guests see the safe foundation (no private
 * data); signed-in members get the real, RLS-scoped notifications center. The
 * notification reads are auth-gated and RLS-protected, so nothing private ever
 * renders for an anonymous visitor.
 */
export function MemberNotificationsPage() {
  const { user, loading } = useAuthSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <FoundationPage
        publicShell
        eyebrow="Member activity"
        title="Notifications"
        description="Sign in to see your follows, likes, comments, subscriptions, tips, sales, messages, and payout activity. This screen renders no private account data while signed out."
        icon={Bell}
        capabilities={capabilities}
        backTo="/login"
        backLabel="Sign in"
      />
    );
  }

  return (
    <SocialShell>
      <div className="mx-auto min-h-screen max-w-2xl space-y-6 border-x border-border/50 px-4 py-6 sm:px-6">
        <header className="space-y-2">
          <p className="eyebrow">Member activity</p>
          <h1 className="font-display text-3xl font-semibold tracking-tighter">Notifications</h1>
        </header>
        <NotificationsCenter />
        <NotificationSettings />
      </div>
    </SocialShell>
  );
}
