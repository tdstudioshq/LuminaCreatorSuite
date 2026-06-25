import { createFileRoute } from "@tanstack/react-router";
import { SettingsPanel } from "@/components/cabana/dashboard/SettingsPanel";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "CABANA" }, { name: "robots", content: "noindex" }] }),
  component: SettingsPanel,
});
