import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { CreatorDirectory } from "@/components/cabana/admin-creators/CreatorDirectory";
import { CreatorsShell } from "@/components/cabana/admin-creators/CreatorsShell";

export const Route = createFileRoute("/admin/creators")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin creator directory." },
    ],
  }),
  component: CreatorsRoute,
});

function CreatorsRoute() {
  return (
    <AdminGate redirect="/admin/creators">
      <CreatorsShell
        eyebrow="Creator operations"
        title="Creators"
        description="Every creator profile on CABANA, newest first. Search and filtering run server-side, results are paginated, and management opens the protected creator-page editor."
      >
        <CreatorDirectory />
      </CreatorsShell>
    </AdminGate>
  );
}
