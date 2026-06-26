import { formatDistanceToNow } from "date-fns";
import { CheckCheck, Loader2 } from "lucide-react";
import {
  type NotificationItem,
  countUnread,
  groupNotificationsByDay,
} from "@/lib/cabana-notifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/use-notifications";
import { NotificationIcon } from "./notification-icons";

/**
 * The real in-app notifications list (Phase 7). Data is RLS-scoped to the
 * recipient and updates live via Supabase Realtime (see use-notifications).
 */
export function NotificationsCenter() {
  const { data, isLoading } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const items = data ?? [];
  const unread = countUnread(items);
  const groups = groupNotificationsByDay(items);

  return (
    <section className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div>
          <h3 className="font-display text-lg font-semibold">Notifications</h3>
          <p className="text-xs text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You're all caught up"}
          </p>
        </div>
        <button
          onClick={() => markAll.mutate()}
          disabled={unread === 0 || markAll.isPending}
          className="btn-ghost !px-3 !py-2 text-xs disabled:opacity-40"
        >
          <CheckCheck className="h-3.5 w-3.5" /> Mark all read
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">
          No notifications yet. Follows, likes, comments, subscriptions, tips, sales, and messages
          will show up here.
        </p>
      ) : (
        <div>
          {groups.map((group) => (
            <div key={group.key}>
              <p className="border-b border-border/40 bg-foreground/[0.02] px-6 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {group.label}
              </p>
              <ul>
                {group.items.map((n) => (
                  <NotificationRow key={n.id} item={n} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const markRead = useMarkNotificationRead();
  return (
    <li>
      <button
        onClick={() => {
          if (!item.isRead) markRead.mutate(item.id);
        }}
        className={`flex w-full items-start gap-3 border-b border-border/40 px-6 py-4 text-left transition-colors last:border-b-0 hover:bg-foreground/[0.03] ${
          item.isRead ? "" : "bg-foreground/[0.04]"
        }`}
      >
        <NotificationIcon type={item.type} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          {item.body && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</p>
          )}
          <time className="mt-1 block text-[10px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </time>
        </div>
        {!item.isRead && (
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-iridescent"
            aria-label="Unread"
          />
        )}
      </button>
    </li>
  );
}
