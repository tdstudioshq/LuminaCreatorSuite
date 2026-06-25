import { createFileRoute } from "@tanstack/react-router";
import { ProfileEditor } from "@/components/cabana/dashboard/ProfileEditor";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({ meta: [{ title: "CABANA" }] }),
  component: ProfileEditor,
});
