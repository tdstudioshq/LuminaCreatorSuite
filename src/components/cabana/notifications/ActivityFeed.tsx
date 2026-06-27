import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { activityLabel, formatNotification } from "@/lib/cabana-notifications";
import { useActivityFeed } from "@/lib/use-notifications";
import { NotificationIcon } from "./notification-icons";

/**
 * The canonical activity log surfaced to the user (events about/by them). Built
 * from `activity_events`; display text derives from the pure `formatNotification`
 * helper using each event's metadata.
 */
export function ActivityFeed() {
  const { data, isError, error, isLoading, refetch } = useActivityFeed();
  const items = data ?? [];

  return (
    <section className="glass overflow-hidden rounded-3xl">
      <div className="border-b border-border/50 px-6 py-4">
        <h3 className="font-display text-lg font-semibold">Activity</h3>
        <p className="text-xs text-muted-foreground">A canonical log of events on your account.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <SectionError
          title="Couldn't load activity"
          description={error instanceof Error ? error.message : "Please try again."}
          onRetry={() => void refetch()}
        />
      ) : items.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul>
          {items.map((event) => {
            const actorName =
              typeof event.metadata.actor_name === "string" ? event.metadata.actor_name : null;
            const { title } = formatNotification(event.type, actorName, event.metadata);
            return (
              <li
                key={event.id}
                className="flex items-start gap-3 border-b border-border/40 px-6 py-4 last:border-b-0"
              >
                <NotificationIcon type={event.type} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {activityLabel(event.type)}
                  </p>
                  <p className="text-sm font-medium">{title}</p>
                  <time className="mt-1 block text-[10px] text-muted-foreground/70">
                    {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SectionError({
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
