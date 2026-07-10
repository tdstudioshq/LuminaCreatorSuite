import { createFileRoute } from "@tanstack/react-router";
import { useCabana } from "@/lib/cabana-store";
import { CreatorDashboard } from "@/components/cabana/dashboard/overview/CreatorDashboard";
import { WelcomeLive } from "@/components/cabana/dashboard/WelcomeLive";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashboardIndex,
});

function DashboardIndex() {
  const { profile } = useCabana();
  return (
    <div className="space-y-6">
      {profile?.handle ? <WelcomeLive handle={profile.handle} /> : null}
      <CreatorDashboard />
    </div>
  );
}
