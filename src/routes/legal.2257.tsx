import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/legal/2257")({
  head: () => ({
    meta: [{ title: "2257 | CABANA" }, { name: "description", content: "CABANA 2257 statement." }],
  }),
  component: Compliance2257Route,
});

function Compliance2257Route() {
  return (
    <MvpRouteShell
      eyebrow="Compliance"
      title="2257 compliance statement"
      description="MVP shell for recordkeeping language, custodian placeholders, adult-content compliance disclaimers, and legal review notes."
      bullets={[
        "Custodian and recordkeeping placeholder",
        "Performer age and consent record scope",
        "Internal legal review still required",
      ]}
      primaryTo="/legal/adult-content-policy"
      primaryLabel="Adult policy"
      secondaryTo="/support"
      secondaryLabel="Contact support"
    />
  );
}
