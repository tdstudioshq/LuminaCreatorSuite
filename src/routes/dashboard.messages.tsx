import { createFileRoute, redirect } from "@tanstack/react-router";

// The demo inbox is retired — real direct messages live at /messages.
export const Route = createFileRoute("/dashboard/messages")({
  beforeLoad: () => {
    throw redirect({ to: "/messages" });
  },
});
