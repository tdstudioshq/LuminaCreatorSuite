import { useState } from "react";
import { Archive, Eye, EyeOff, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { STATUS_ACTION_COPY, safeCreatorEditorError } from "@/lib/cabana-admin-creator-editor";
import {
  allowedPageStatusActions,
  type CreatorPageStatus,
  type PageStatusAction,
} from "@/lib/cabana-creator-pages";

const ACTION_ICONS = {
  publish: Eye,
  unpublish: EyeOff,
  archive: Archive,
  restore: RotateCcw,
} as const;

export function AdminCreatorPageLifecycle({
  status,
  onAction,
}: {
  status: CreatorPageStatus;
  onAction: (action: PageStatusAction) => Promise<void>;
}) {
  const [pending, setPending] = useState<PageStatusAction | null>(null);
  const [error, setError] = useState("");
  const actions = allowedPageStatusActions(status);

  const run = async (action: PageStatusAction) => {
    setPending(action);
    setError("");
    try {
      await onAction(action);
    } catch (caught) {
      setError(safeCreatorEditorError(caught, "Couldn’t update the page status. Try again."));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="glass-strong space-y-4 rounded-3xl p-5" aria-labelledby="lifecycle-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="lifecycle-title" className="font-display text-lg font-semibold">
            Page lifecycle
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Only valid transitions are available.
          </p>
        </div>
        <span
          data-page-status={status}
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            status === "published"
              ? "bg-emerald-400/15 text-emerald-300"
              : status === "archived"
                ? "bg-rose-400/15 text-rose-300"
                : "bg-amber-400/15 text-amber-300"
          }`}
        >
          {status}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const copy = STATUS_ACTION_COPY[action];
          const Icon = ACTION_ICONS[action];
          return (
            <AlertDialog key={action}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant={copy.destructive ? "destructive" : "outline"}
                  size="sm"
                  disabled={pending !== null}
                >
                  <Icon className="h-3.5 w-3.5" /> {copy.label}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy.confirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{copy.confirmDescription}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void run(action)}
                    className={
                      copy.destructive ? "[--metal-body:var(--gradient-metal-destructive)]" : ""
                    }
                  >
                    {copy.label}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
