import { formatDistanceToNow } from "date-fns";
import { CheckCheck, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  type NotificationItem,
  countUnread,
  groupNotificationsByDay,
  notificationTypeLabel,
  resolveNotificationTarget,
} from "@/lib/cabana-notifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotifications,
} from "@/lib/use-notifications";
import { NotificationIcon } from "./notification-icons";

/**
 * The real in-app notifications list (Phase 7). Data is RLS-scoped to the
 * recipient and updates live via Supabase Realtime (see use-notifications).
 */
export function NotificationsCenter() {
  const { data, isError, error, isLoading, refetch } = useNotifications();
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
      ) : isError ? (
        <NotificationErrorState
          title="Couldn't load notifications"
          description={error instanceof Error ? error.message : "Please try again."}
          onRetry={() => void refetch()}
        />
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
  const markUnread = useMarkNotificationUnread();
  const target = resolveNotificationTarget(item);
  const contentClasses = target ? "group min-w-0 flex-1 text-left" : "min-w-0 flex-1 text-left";
  return (
    <li>
      <div
        className={`flex w-full items-start gap-3 border-b border-border/40 px-6 py-4 last:border-b-0 ${
          item.isRead ? "" : "bg-foreground/[0.04]"
        }`}
      >
        <NotificationIcon type={item.type} />
        {target ? (
          <Link
            to={target.href}
            className={`${contentClasses} rounded-2xl transition-colors hover:bg-foreground/[0.03]`}
          >
            <p className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{notificationTypeLabel(item.type)}</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 normal-case tracking-normal text-foreground/80">
                {target.label}
              </span>
              {!item.isRead && (
                <span className="rounded-full bg-iridescent/15 px-2 py-0.5 normal-case tracking-normal text-iridescent">
                  Unread
                </span>
              )}
            </p>
            <p className="mt-1 text-sm font-medium transition-colors group-hover:text-iridescent">
              {item.title}
            </p>
            {item.body && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</p>
            )}
            <time className="mt-1 block text-[10px] text-muted-foreground/70">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </time>
          </Link>
        ) : (
          <div className={contentClasses}>
            <p className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{notificationTypeLabel(item.type)}</span>
              {!item.isRead && (
                <span className="rounded-full bg-iridescent/15 px-2 py-0.5 normal-case tracking-normal text-iridescent">
                  Unread
                </span>
              )}
            </p>
            <p className="mt-1 text-sm font-medium">{item.title}</p>
            {item.body && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</p>
            )}
            <time className="mt-1 block text-[10px] text-muted-foreground/70">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </time>
          </div>
        )}
        <div className="ml-3 flex shrink-0 flex-col items-end gap-2">
          {target && (
            <Link
              to={target.href}
              className="btn-ghost !px-3 !py-1.5 text-[11px] transition-colors"
            >
              Open
            </Link>
          )}
          <button
            onClick={() => (item.isRead ? markUnread.mutate(item.id) : markRead.mutate(item.id))}
            disabled={markRead.isPending || markUnread.isPending}
            className="btn-ghost !px-3 !py-1.5 text-[11px] disabled:opacity-40"
          >
            {item.isRead ? "Mark unread" : "Mark read"}
          </button>
        </div>
      </div>
    </li>
  );
}

function NotificationErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <button onClick={onRetry} className="btn-ghost mt-4 !px-3 !py-2 text-xs">
        Try again
      </button>
    </div>
  );
}
