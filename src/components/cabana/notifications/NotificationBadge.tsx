import { useUnreadNotificationCount } from "@/lib/use-notifications";

/**
 * Unread-count badge for nav. Live via Realtime (the hook subscribes). Renders
 * nothing when there are zero unread.
 */
export function NotificationBadge({ className = "" }: { className?: string }) {
  const { data: count = 0 } = useUnreadNotificationCount();
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full bg-iridescent px-1.5 text-[10px] font-semibold leading-[18px] text-background ${className}`}
      aria-label={`${count} unread notifications`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
