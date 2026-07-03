import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashSidebar, MobileTabs } from "@/components/cabana/dashboard/Sidebar";
import { useAuthSession } from "@/lib/cabana-auth";
import { useAccountType } from "@/lib/use-account";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Premium creator OS — manage links, storefront, analytics, AI tools and your media kit.",
      },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useAuthSession();
  // The creator dashboard is creator-only. Members are bounced to /settings.
  const { accountType, loading: accountLoading } = useAccountType();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: path } as never });
      return;
    }
    if (user && !accountLoading && accountType === "member") {
      navigate({ to: "/settings" });
    }
  }, [loading, user, accountLoading, accountType, navigate, path]);

  if (loading || !user || accountLoading || accountType === "member") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
          Securing your studio…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-iridescent opacity-20 blur-[120px] animate-float" />
        <div
          className="absolute top-1/2 -right-40 w-[520px] h-[520px] rounded-full bg-accent opacity-15 blur-[120px] animate-float"
          style={{ animationDelay: "2s" }}
        />
      </div>
      <DashSidebar />
      <main className="lg:ml-72 px-4 lg:px-8 py-6 lg:py-8 max-w-[1400px]">
        <MobileTabs />
        <div className="mt-4 lg:mt-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
