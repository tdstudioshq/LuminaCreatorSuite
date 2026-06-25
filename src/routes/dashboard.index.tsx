import { createFileRoute } from "@tanstack/react-router";
import { DashHome } from "@/components/cabana/dashboard/DashHome";

export const Route = createFileRoute("/dashboard/")({
  component: DashHome,
});
