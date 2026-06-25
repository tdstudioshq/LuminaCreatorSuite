import { createFileRoute } from "@tanstack/react-router";
import { DemoMessages } from "@/components/cabana/demo/DemoMessages";

export const Route = createFileRoute("/dashboard/messages")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DemoMessages,
});
