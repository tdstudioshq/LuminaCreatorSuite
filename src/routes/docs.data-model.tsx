import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/data-model")({
  beforeLoad: () => {
    throw redirect({ to: "/support" });
  },
});
