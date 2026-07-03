import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/storefront")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/profile" });
  },
});
