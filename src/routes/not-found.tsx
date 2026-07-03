import { createFileRoute } from "@tanstack/react-router";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/not-found")({
  head: () => ({ meta: [{ title: "Not Found | CABANA" }] }),
  component: NotFoundRoute,
});

function NotFoundRoute() {
  return (
    <MvpRouteShell
      eyebrow="404"
      title="Page not found"
      description="The route does not exist or has moved. Use the links below to return to a working MVP surface."
      status="Not found"
      primaryTo="/explore"
      primaryLabel="Explore"
      secondaryTo="/login"
      secondaryLabel="Sign in"
    />
  );
}
