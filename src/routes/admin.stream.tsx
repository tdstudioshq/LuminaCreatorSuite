import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AdminGate } from "@/components/cabana/admin-finance/AdminGate";
import { StreamOrphanPanel } from "@/components/cabana/admin-stream/StreamOrphanPanel";

export const Route = createFileRoute("/admin/stream")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "CABANA admin Stream video operations." },
    ],
  }),
  component: StreamOpsRoute,
});

function StreamOpsRoute() {
  return (
    <AdminGate redirect="/admin/stream">
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Admin
            </Link>
            <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.22em] text-primary">
              Video operations
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
              Stream storage
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Reclaim Cloudflare Stream assets that no longer belong to a post. Previewing is
              read-only; reclaiming is permanent and never touches media attached to a post.
            </p>
          </div>
          <StreamOrphanPanel />
        </div>
      </div>
    </AdminGate>
  );
}
