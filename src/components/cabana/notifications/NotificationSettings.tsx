import { Loader2 } from "lucide-react";
import type { NotificationPreferences } from "@/lib/cabana-notifications";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/lib/use-notifications";

type Field = keyof NotificationPreferences;

const ROWS: { field: Field; label: string; hint: string; placeholder?: boolean }[] = [
  { field: "inAppEnabled", label: "In-app notifications", hint: "Show notifications in CABANA." },
  {
    field: "emailEnabled",
    label: "Email notifications",
    hint: "Queue email delivery (no provider connected yet).",
    placeholder: true,
  },
  {
    field: "pushEnabled",
    label: "Push notifications",
    hint: "Queue push delivery (no provider connected yet).",
    placeholder: true,
  },
];

/** Per-user notification preferences. Email/push are placeholder channels: they
 *  only enqueue inert outbox rows — there is no delivery provider. */
export function NotificationSettings() {
  const { data: prefs, isError, error, isLoading, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  return (
    <section className="glass rounded-3xl p-6">
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold">Notification settings</h3>
        <p className="text-xs text-muted-foreground">
          Choose how you're notified. Email & push are placeholders for a future delivery pipeline.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <SectionError
          title="Couldn't load preferences"
          description={error instanceof Error ? error.message : "Please try again."}
          onRetry={() => void refetch()}
        />
      ) : !prefs ? (
        <SectionError
          title="No preference data"
          description="Your notification settings could not be loaded."
          onRetry={() => void refetch()}
        />
      ) : (
        <ul className="space-y-2">
          {ROWS.map((row) => (
            <li
              key={row.field}
              className="flex items-center justify-between gap-4 rounded-2xl bg-foreground/[0.03] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {row.label}
                  {row.placeholder && (
                    <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      Soon
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{row.hint}</p>
              </div>
              <Toggle
                on={prefs[row.field]}
                disabled={update.isPending}
                onToggle={() => update.mutate({ [row.field]: !prefs[row.field] })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Toggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-iridescent" : "bg-foreground/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
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
    <div className="rounded-2xl bg-foreground/[0.03] px-4 py-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <button onClick={onRetry} className="btn-ghost mt-4 !px-3 !py-2 text-xs">
        Try again
      </button>
    </div>
  );
}
