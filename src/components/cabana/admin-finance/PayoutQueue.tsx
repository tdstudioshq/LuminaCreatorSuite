import { useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { Button } from "@/components/ui/button";
import { creatorLabel, formatCents } from "@/lib/cabana-finance";
import {
  type AdminPayoutRequest,
  type PayoutAction,
  type PayoutRequestStatus,
  PAYOUT_REQUEST_STATUSES,
  availablePayoutActions,
  countPayoutRequestsByStatus,
  filterPayoutRequestsByStatus,
  payoutActionLabel,
  payoutRequestStatusLabel,
  sortPayoutRequestsForQueue,
} from "@/lib/cabana-payouts";
import { useAdminPayoutRequests } from "@/lib/use-admin-payouts";
import { PayoutActionDialog } from "./PayoutActionDialog";

type Tab = PayoutRequestStatus | "all";

const STATUS_STYLES: Record<PayoutRequestStatus, string> = {
  requested: "bg-amber-400/15 text-amber-300",
  on_hold: "bg-sky-400/15 text-sky-300",
  approved: "bg-violet-400/15 text-violet-300",
  rejected: "bg-rose-400/15 text-rose-300",
  paid: "bg-emerald-400/15 text-emerald-300",
};

export function PayoutQueue() {
  const { data, isLoading, isError, refetch } = useAdminPayoutRequests();
  const [tab, setTab] = useState<Tab>("all");
  const [pending, setPending] = useState<{
    request: AdminPayoutRequest;
    action: PayoutAction;
  } | null>(null);

  const counts = useMemo(() => countPayoutRequestsByStatus(data ?? []), [data]);
  const rows = useMemo(() => {
    const base = tab === "all" ? (data ?? []) : filterPayoutRequestsByStatus(data ?? [], tab);
    return sortPayoutRequestsForQueue(base);
  }, [data, tab]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return <QueryErrorState title="Couldn’t load payout requests" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        <TabPill active={tab === "all"} onClick={() => setTab("all")}>
          All · {data?.length ?? 0}
        </TabPill>
        {PAYOUT_REQUEST_STATUSES.map((s) => (
          <TabPill key={s} active={tab === s} onClick={() => setTab(s)}>
            {payoutRequestStatusLabel(s)} · {counts[s]}
          </TabPill>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl p-10 text-center text-sm text-muted-foreground">
          <Wallet className="h-5 w-5" />
          No payout requests here.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const actions = availablePayoutActions(r.status);
            return (
              <li key={r.id} className="glass rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{creatorLabel(r)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Requested {new Date(r.createdAt).toLocaleDateString()}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-semibold tabular-nums">
                      {formatCents(r.amountCents, r.currency)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status]}`}
                    >
                      {payoutRequestStatusLabel(r.status)}
                    </span>
                  </div>
                </div>
                {actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border/30 pt-3">
                    {actions.map((a) => (
                      <Button
                        key={a}
                        size="sm"
                        variant={a === "reject" ? "ghost" : "secondary"}
                        className={a === "reject" ? "text-rose-300/80 hover:text-rose-300" : ""}
                        onClick={() => setPending({ request: r, action: a })}
                      >
                        {payoutActionLabel(a)}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <PayoutActionDialog
        request={pending?.request ?? null}
        action={pending?.action ?? null}
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      />
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-iridescent text-background shadow-glow-sm"
          : "glass text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
