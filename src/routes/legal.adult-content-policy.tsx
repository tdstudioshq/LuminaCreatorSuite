import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/legal/adult-content-policy")({
  head: () => ({
    meta: [
      { title: "Adult Content Policy | CABANA" },
      { name: "description", content: "CABANA adult content policy." },
    ],
  }),
  component: AdultContentPolicyRoute,
});

function AdultContentPolicyRoute() {
  return (
    <MvpRouteShell
      eyebrow="Safety"
      title="Adult content policy"
      description="MVP shell for 18+ rules, prohibited content, consent requirements, reporting, and takedown paths."
      bullets={[
        "18+ participation and audience requirements",
        "Consent and performer record expectations",
        "Prohibited content and takedown process",
      ]}
      primaryTo="/takedown"
      primaryLabel="Report content"
      secondaryTo="/legal/2257"
      secondaryLabel="View 2257"
    />
  );
}
