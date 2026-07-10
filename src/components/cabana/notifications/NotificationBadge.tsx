import { useUnreadNotificationCount } from "@/lib/use-notifications";
import { UnreadBadge } from "./UnreadBadge";

/**
 * Unread-notification badge for nav. Live via Realtime (the hook subscribes).
 * Renders nothing when there are zero unread.
 */
export function NotificationBadge({ className = "" }: { className?: string }) {
  const { data: count = 0 } = useUnreadNotificationCount();
  return (
    <UnreadBadge count={count} label={`${count} unread notifications`} className={className} />
  );
}
