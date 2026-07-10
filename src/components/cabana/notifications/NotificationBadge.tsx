import { useInAppNotificationsEnabled, useUnreadNotificationCount } from "@/lib/use-notifications";
import { UnreadBadge } from "./UnreadBadge";

/**
 * Unread-notification badge for nav. Live via Realtime (the hook subscribes).
 * Renders nothing when there are zero unread, or when the user has turned
 * in-app notifications off — the same preference gate the center uses, so
 * badges never advertise notifications the center refuses to display.
 */
export function NotificationBadge({ className = "" }: { className?: string }) {
  const { data: count = 0 } = useUnreadNotificationCount();
  const inApp = useInAppNotificationsEnabled();
  if (!inApp.enabled) return null;
  return (
    <UnreadBadge count={count} label={`${count} unread notifications`} className={className} />
  );
}
