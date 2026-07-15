import { createFileRoute } from "@tanstack/react-router";
import { AdminCreatorPageEditor } from "@/components/cabana/admin-creators/AdminCreatorPageEditor";
import { CreatorsShell } from "@/components/cabana/admin-creators/CreatorsShell";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";

export const Route = createFileRoute("/admin/creators/$creatorProfileId")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Manage a CABANA creator page." },
    ],
  }),
  component: CreatorPageEditorRoute,
});

function CreatorPageEditorRoute() {
  const { creatorProfileId } = Route.useParams();
  return (
    <AdminGate redirect={`/admin/creators/${creatorProfileId}`}>
      <CreatorsShell
        eyebrow="Creator operations"
        title="Creator-page editor"
        description="Manage identity, appearance, links, lifecycle, and ownership through protected admin workflows."
      >
        <AdminCreatorPageEditor key={creatorProfileId} creatorProfileId={creatorProfileId} />
      </CreatorsShell>
    </AdminGate>
  );
}
