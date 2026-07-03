import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/performance")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/home" });
  },
});
