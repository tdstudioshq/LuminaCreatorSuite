import { NotificationsCenter } from "./NotificationsCenter";
import { ActivityFeed } from "./ActivityFeed";
import { NotificationSettings } from "./NotificationSettings";

/**
 * Creator/member notifications center for the dashboard (Phase 7). Real,
 * RLS-scoped in-app notifications with live Realtime delivery, the canonical
 * activity log, and notification preferences. Replaces the demo placeholder.
 */
export function NotificationsDashboard() {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Activity</p>
        <h1 className="font-display text-4xl font-semibold tracking-tighter md:text-5xl">
          Notifications
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          In-app alerts for follows, likes, comments, subscriptions, tips, sales, messages, and
          payouts — delivered live. Email & push are placeholder channels with no provider
          connected.
        </p>
      </header>

      <NotificationsCenter />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityFeed />
        <NotificationSettings />
      </div>
    </div>
  );
}
