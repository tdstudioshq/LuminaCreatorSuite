import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/cabana/marketing/LandingPage";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "The luxury operating system for modern creators." },
      { property: "og:title", content: "CABANA" },
      {
        property: "og:description",
        content: "The luxury operating system for modern creators.",
      },
    ],
  }),
});

function Index() {
  return <LandingPage />;
}
