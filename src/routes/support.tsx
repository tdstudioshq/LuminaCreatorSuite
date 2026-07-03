import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [{ title: "Support | CABANA" }, { name: "description", content: "CABANA support." }],
  }),
  component: SupportRoute,
});

function SupportRoute() {
  return (
    <MvpRouteShell
      eyebrow="Help"
      title="Support center"
      description="MVP shell for account help, billing support, safety reporting, creator onboarding, and platform policy questions."
      bullets={[
        "Account and login support",
        "Billing and subscription help",
        "Safety, reporting, and takedown paths",
      ]}
      primaryTo="/takedown"
      primaryLabel="Submit takedown"
      secondaryTo="/login"
      secondaryLabel="Sign in"
    />
  );
}
