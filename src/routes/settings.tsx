import { createFileRoute } from "@tanstack/react-router";
import { RequireSignedIn } from "@/components/cabana/auth/RequireSignedIn";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { MvpRouteShell } from "@/components/cabana/MvpRouteShell";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings | CABANA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <RequireSignedIn>
      <SocialShell>
        <div className="px-4 py-8 sm:px-6">
          <MvpRouteShell
            contained
            eyebrow="Fan account"
            title="Settings"
            description="Central fan settings for profile, account, security, notifications, privacy, and billing."
            bullets={[
              "Profile and account settings",
              "Security and privacy controls",
              "Notification and billing preferences",
            ]}
            primaryTo="/feed"
            primaryLabel="Back to feed"
            secondaryTo="/billing"
            secondaryLabel="Billing"
          />
        </div>
      </SocialShell>
    </RequireSignedIn>
  );
}
