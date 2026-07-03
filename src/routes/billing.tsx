import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [{ title: "Billing | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: BillingRoute,
});

function BillingRoute() {
  return (
    <RequireSignedIn>
      <SocialShell>
        <div className="px-4 py-8 sm:px-6">
          <MvpRouteShell
            contained
            eyebrow="Fan account"
            title="Billing"
            description="Manage payment methods, receipts, failed payments, and subscription invoices."
            bullets={[
              "Payment method management",
              "Invoice and receipt history",
              "Retry failed payment flow",
            ]}
            primaryTo="/feed"
            primaryLabel="Back to feed"
            secondaryTo="/settings"
            secondaryLabel="Account settings"
          />
        </div>
      </SocialShell>
    </RequireSignedIn>
  );
}
