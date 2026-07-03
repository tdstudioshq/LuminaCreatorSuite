import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings" });
  },
});
