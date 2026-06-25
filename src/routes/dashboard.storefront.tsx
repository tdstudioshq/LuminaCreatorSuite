import { createFileRoute } from "@tanstack/react-router";
import { StoreManager } from "@/components/cabana/dashboard/StoreManager";

export const Route = createFileRoute("/dashboard/storefront")({
  head: () => ({ meta: [{ title: "CABANA" }] }),
  component: StoreManager,
});
