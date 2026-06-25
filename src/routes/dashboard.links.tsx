import { createFileRoute } from "@tanstack/react-router";
import { LinkManager } from "@/components/cabana/dashboard/LinkManager";

export const Route = createFileRoute("/dashboard/links")({
  head: () => ({ meta: [{ title: "CABANA" }] }),
  component: LinkManager,
});
