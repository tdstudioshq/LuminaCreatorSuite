import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/ledger/$transactionId")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/transactions" });
  },
});
