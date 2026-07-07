import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginCard } from "@/components/cabana/auth/LoginCard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "CABANA" }, { name: "description", content: "Sign in to your CABANA Studio." }],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginCard,
});
