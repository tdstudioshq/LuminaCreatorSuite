import { createFileRoute } from "@tanstack/react-router";
import { AIStudio } from "@/components/cabana/dashboard/AIStudio";

export const Route = createFileRoute("/dashboard/ai")({
  head: () => ({ meta: [{ title: "CABANA" }, { name: "robots", content: "noindex" }] }),
  component: AIStudio,
});
