import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { CreatorDirectory } from "@/components/cabana/admin-creators/CreatorDirectory";
import { CreatorsShell } from "@/components/cabana/admin-creators/CreatorsShell";
import { ADMIN_CREATORS_READONLY_NOTICE } from "@/lib/cabana-admin-creators";

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
        description="Every creator profile on CABANA, newest first. Live data read under your own admin authorization — search and filtering run server-side, and results are paginated rather than capped."
        notice={ADMIN_CREATORS_READONLY_NOTICE}
      >
        <CreatorDirectory />
      </CreatorsShell>
    </AdminGate>
  );
}
