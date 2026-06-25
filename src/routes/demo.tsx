import { createFileRoute } from "@tanstack/react-router";
import { CreatorProfile } from "./$username";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "Live demo of a CABANA creator page." },
    ],
  }),
  component: () => <CreatorProfile username="aurora" />,
});
