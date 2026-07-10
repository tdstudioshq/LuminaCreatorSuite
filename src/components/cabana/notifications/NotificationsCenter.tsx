import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, BellOff, CheckCheck, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/cabana/EmptyState";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NOTIFICATION_TYPES,
  NOTIFICATIONS_LIMIT_MAX,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationItem,
  type NotificationType,
  countUnread,
  groupNotificationsByDay,
  notificationTypeLabel,
  resolveNotificationTarget,
} from "@/lib/cabana-notifications";
import {
  useInAppNotificationsEnabled,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotifications,
  useUnreadNotificationCount,
  useUpdateNotificationPreferences,
} from "@/lib/use-notifications";
import { NotificationIcon } from "./notification-icons";

type ReadFilter = "all" | "unread";
type TypeFilter = NotificationType | "all";

/**
 * The in-app notifications center (Phase 9B over the Phase 7 read surface).
 * Data is RLS-scoped to the recipient and updates live via Supabase Realtime
 * (per-instance channel topics — see use-notifications). Unread/type filters
 * run server-side; the limit grows within the H-08 clamp (max 200). A disabled
 * in_app preference suppresses the list (and, via the shared hook, all badges).
 */
export function NotificationsCenter() {
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [limit, setLimit] = useState(NOTIFICATIONS_PAGE_SIZE);
  const filtered = readFilter === "unread" || typeFilter !== "all";

  const { data, isError, error, isLoading, isPlaceholderData, refetch } = useNotifications(limit, {
    unreadOnly: readFilter === "unread",
    type: typeFilter === "all" ? undefined : typeFilter,
  });
  const { data: unreadCount } = useUnreadNotificationCount();
  const inApp = useInAppNotificationsEnabled();
  const updatePrefs = useUpdateNotificationPreferences();
  const markAll = useMarkAllNotificationsRead();

  const items = data ?? [];
  // Server total when available (consistent with the badges); otherwise fall
  // back to the visibly-unread loaded rows so the header and Mark-all-read can
  // never contradict the rendered list (no fake "caught up" while the count
  // query is failing or still in flight).
  const unread = unreadCount ?? countUnread(items);
  const inAppPaused = !inApp.isLoading && !inApp.enabled;

  const changeReadFilter = (next: ReadFilter) => {
    setReadFilter(next);
    setLimit(NOTIFICATIONS_PAGE_SIZE);
  };
  const changeTypeFilter = (next: TypeFilter) => {
    setTypeFilter(next);
    setLimit(NOTIFICATIONS_PAGE_SIZE);
  };
  const clearFilters = () => {
    setReadFilter("all");
    setTypeFilter("all");
    setLimit(NOTIFICATIONS_PAGE_SIZE);
  };

  return (
    <section className="glass overflow-hidden rounded-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-6 py-4">
        <div>
          <h3 className="font-display text-lg font-semibold">Notifications</h3>
          <p className="text-xs text-muted-foreground">
            {inAppPaused
              ? "In-app display is turned off in your settings"
              : unread > 0
                ? `${unread} unread`
                : "You're all caught up"}
          </p>
        </div>
        {!inAppPaused && (
          <button
            onClick={() => markAll.mutate()}
            disabled={unread === 0 || markAll.isPending}
            className="btn-ghost !px-3 !py-2 text-xs disabled:opacity-60"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      {!inAppPaused && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border/40 px-6 py-3">
          <div
            role="group"
            aria-label="Read state"
            className="inline-flex items-center gap-1 rounded-full glass p-1"
          >
            {(["all", "unread"] as const).map((value) => {
              const active = readFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => changeReadFilter(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-iridescent text-background shadow-glow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value === "all" ? "All" : "Unread"}
                </button>
              );
            })}
          </div>
          <Select value={typeFilter} onValueChange={(v) => changeTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label="Notification type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {NOTIFICATION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {notificationTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {inAppPaused ? (
        <div className="p-6">
          <EmptyState
            icon={BellOff}
            title="In-app notifications are off"
            description="Your preference hides notifications and unread badges across CABANA, and new activity won't create alerts while it's off."
            action={
              <button
                onClick={() => updatePrefs.mutate({ inAppEnabled: true })}
                disabled={updatePrefs.isPending}
                className="btn-ghost !px-3 !py-2 text-xs disabled:opacity-60"
              >
                <Bell className="h-3.5 w-3.5" /> Turn back on
              </button>
            }
          />
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <QueryErrorState
          title="Couldn't load notifications"
          message={error instanceof Error ? error.message : "Please try again."}
          onRetry={() => void refetch()}
          className="m-6"
        />
      ) : items.length === 0 ? (
        <div className="p-6">
          {readFilter === "unread" && typeFilter === "all" ? (
            <EmptyState
              icon={CheckCheck}
              title="You're all caught up"
              description="No unread notifications right now."
              action={
                <button onClick={clearFilters} className="btn-ghost !px-3 !py-2 text-xs">
                  Show all notifications
                </button>
              }
            />
          ) : filtered ? (
            <EmptyState
              icon={Bell}
              title="Nothing matches this filter"
              description="No notifications of this kind yet — try a different type or show everything."
              action={
                <button onClick={clearFilters} className="btn-ghost !px-3 !py-2 text-xs">
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={Bell}
              title="No notifications yet"
              description="Follows, likes, comments, subscriptions, tips, sales, and messages will show up here."
            />
          )}
        </div>
      ) : (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {groupNotificationsByDay(items).map((group) => (
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
          {items.length >= limit && limit < NOTIFICATIONS_LIMIT_MAX ? (
            <div className="flex justify-center border-t border-border/40 px-6 py-3">
              <button
                onClick={() =>
                  setLimit((l) => Math.min(NOTIFICATIONS_LIMIT_MAX, l + NOTIFICATIONS_PAGE_SIZE))
                }
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                Load more
              </button>
            </div>
          ) : items.length >= NOTIFICATIONS_LIMIT_MAX ? (
            <p className="border-t border-border/40 px-6 py-3 text-center text-[11px] text-muted-foreground/70">
              Showing the latest {NOTIFICATIONS_LIMIT_MAX} notifications
              {filtered ? " for this filter" : ""}.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const target = resolveNotificationTarget(item);
  // Clicking through to the target counts as reading the notification.
  const markReadOnOpen = () => {
    if (!item.isRead) markRead.mutate(item.id);
  };
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
            onClick={markReadOnOpen}
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
              onClick={markReadOnOpen}
              className="btn-ghost !px-3 !py-1.5 text-[11px] transition-colors"
            >
              Open
            </Link>
          )}
          <button
            onClick={() => (item.isRead ? markUnread.mutate(item.id) : markRead.mutate(item.id))}
            disabled={markRead.isPending || markUnread.isPending}
            className="btn-ghost !px-3 !py-1.5 text-[11px] disabled:opacity-60"
          >
            {item.isRead ? "Mark unread" : "Mark read"}
          </button>
        </div>
      </div>
    </li>
  );
}
