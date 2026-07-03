import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "Sign in to your CABANA account." },
    ],
  }),
});
