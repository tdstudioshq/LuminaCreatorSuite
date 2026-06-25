import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  Bell,
  Crown,
  Heart,
  MessageCircle,
  UserPlus,
  Gift,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/lib/cabana-types";
import { CABANA_DEMO_DATA } from "@/lib/cabana-demo-data";
import { DemoNotice, DemoPageHeader } from "@/components/cabana/demo/DemoShell";

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  subscription: Crown,
  message: MessageCircle,
  tip: Gift,
  purchase: Sparkles,
  payout: Gift,
  system: Bell,
};

export function DemoNotifications() {
  const { notifications } = CABANA_DEMO_DATA;
  // Local-only read state so the demo is interactive without any backend write.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(
    () => new Set(notifications.filter((n) => n.readAt !== null).map((n) => n.id)),
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DemoPageHeader
          eyebrow="Activity"
          title="Notifications"
          description="Your activity center built from demo notifications. Marking read is local-only — nothing is persisted."
        />
        <button
          type="button"
          onClick={() => setReadIds(new Set(notifications.map((n) => n.id)))}
          disabled={unreadCount === 0}
          className="btn-ghost !px-4 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark all read{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </button>
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        <ul>
          {notifications.map((notification, index) => {
            const Icon = TYPE_ICONS[notification.type];
            const isUnread = !readIds.has(notification.id);
            return (
              <motion.li
                key={notification.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setReadIds((prev) => {
                      const next = new Set(prev);
                      next.add(notification.id);
                      return next;
                    })
                  }
                  className={`flex w-full items-start gap-4 border-b border-border/40 px-6 py-4 text-left transition-colors last:border-b-0 ${
                    isUnread ? "bg-foreground/[0.04]" : ""
                  } hover:bg-foreground/[0.06]`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl glass-strong">
                    <Icon className="h-4 w-4 text-iridescent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{notification.title}</span>
                      {isUnread ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-iridescent shadow-glow-sm" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {notification.body}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {format(new Date(notification.createdAt), "MMM d")}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <DemoNotice>
        Demo notifications from the mock data layer. Read state is local to this session; no
        notification records, counts, or deliveries are stored.
      </DemoNotice>
    </div>
  );
}
