import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginCard } from "@/components/cabana/auth/LoginCard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "description", content: "Sign in to your CABANA Studio." },
      { property: "og:title", content: "CABANA" },
      {
        property: "og:description",
        content: "The luxury operating system for modern creators.",
      },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
});

function Index() {
  return <LoginCard />;
}
