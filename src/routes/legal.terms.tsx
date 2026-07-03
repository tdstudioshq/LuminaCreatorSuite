import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [{ title: "Terms | CABANA" }, { name: "description", content: "CABANA terms." }],
  }),
  component: TermsRoute,
});

function TermsRoute() {
  return (
    <MvpRouteShell
      eyebrow="Legal"
      title="Terms of service"
      description="MVP shell for platform terms, adult creator rules, subscriptions, payments, user conduct, and account enforcement."
      bullets={[
        "Adult platform terms and creator responsibilities",
        "Subscription, PPV, and tipping terms",
        "Account suspension and appeal expectations",
      ]}
      primaryTo="/support"
      primaryLabel="Go to support"
      secondaryTo="/login"
      secondaryLabel="Sign in"
    />
  );
}
