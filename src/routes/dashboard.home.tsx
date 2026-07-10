import { createFileRoute, redirect } from "@tanstack/react-router";

// The creator business home was promoted to the /dashboard index (Phase 11A
// follow-up); this redirect preserves old deep links.
export const Route = createFileRoute("/dashboard/home")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
