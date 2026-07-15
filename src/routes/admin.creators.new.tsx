import { createFileRoute } from "@tanstack/react-router";
import { AdminCreatorPageCreateForm } from "@/components/cabana/admin-creators/AdminCreatorPageCreateForm";
import { CreatorsShell } from "@/components/cabana/admin-creators/CreatorsShell";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";

export const Route = createFileRoute("/admin/creators/new")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Create a CABANA creator page." },
    ],
  }),
  component: NewCreatorPageRoute,
});

function NewCreatorPageRoute() {
  return (
    <AdminGate redirect="/admin/creators/new">
      <CreatorsShell
        eyebrow="Creator operations"
        title="New creator page"
        description="Create an ownerless draft using the same protected workflow as the rest of creator-page management."
      >
        <AdminCreatorPageCreateForm />
      </CreatorsShell>
    </AdminGate>
  );
}
