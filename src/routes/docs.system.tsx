import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/system")({
  beforeLoad: () => {
    throw redirect({ to: "/support" });
  },
});
