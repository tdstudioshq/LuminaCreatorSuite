import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({ meta: [{ title: "Unauthorized | CABANA" }] }),
  component: UnauthorizedRoute,
});

function UnauthorizedRoute() {
  return (
    <MvpRouteShell
      eyebrow="Access"
      title="You do not have access"
      description="This account does not have permission to open the requested area. Sign in with the right account or return to a permitted surface."
      status="Access guard"
      primaryTo="/login"
      primaryLabel="Sign in"
      secondaryTo="/feed"
      secondaryLabel="Back to feed"
    />
  );
}
