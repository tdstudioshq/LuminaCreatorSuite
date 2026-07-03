import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [{ title: "Subscriptions | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SubscriptionsRoute,
});

function SubscriptionsRoute() {
  return (
    <RequireSignedIn>
      <SocialShell>
        <div className="px-4 py-8 sm:px-6">
          <MvpRouteShell
            contained
            eyebrow="Fan account"
            title="Subscriptions"
            description="Track active and canceled creator subscriptions, renewal dates, and cancellation actions."
            bullets={[
              "Active creator subscriptions",
              "Canceled and expired history",
              "Cancel/resume controls",
            ]}
            primaryTo="/feed"
            primaryLabel="Back to feed"
            secondaryTo="/explore"
            secondaryLabel="Explore creators"
          />
        </div>
      </SocialShell>
    </RequireSignedIn>
  );
}
