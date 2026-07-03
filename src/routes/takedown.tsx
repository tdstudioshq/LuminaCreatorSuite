import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/takedown")({
  head: () => ({
    meta: [
      { title: "Takedown | CABANA" },
      { name: "description", content: "CABANA takedown and safety request." },
    ],
  }),
  component: TakedownRoute,
});

function TakedownRoute() {
  return (
    <MvpRouteShell
      eyebrow="Trust and safety"
      title="Takedown request"
      description="MVP shell for DMCA, consent, adult-safety, and policy takedown requests. Form submission will be wired in the backend phase."
      bullets={[
        "Required claimant and contact fields",
        "Target content URL and evidence fields",
        "Adult safety complaint escalation path",
      ]}
      primaryTo="/support"
      primaryLabel="Go to support"
      secondaryTo="/legal/adult-content-policy"
      secondaryLabel="Adult policy"
    />
  );
}
