// ============================================================================
// CABANA — admin creator directory (Phase 1, READ-ONLY)
// ----------------------------------------------------------------------------
// PRESENTATION ONLY. Every decision — query clamping, search sanitization, row
// mapping, page summary — comes from the pure `cabana-admin-creators` module.
//
// This surface is deliberately READ-ONLY and says so. There are no admin write
// policies on `creator_profiles` / `links` in the database, so there is nothing
// honest to wire an edit button to yet. It renders NO action menus, NO disabled
// "manage" affordances, and NO email column (see the notice — an admin genuinely
// cannot read another account's email under current policies).
// ============================================================================
import { useEffect, useState } from "react";
import { ExternalLink, Link2, Search, UserRound, Users } from "lucide-react";
import { EmptyState } from "@/components/cabana/EmptyState";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import {
  ADMIN_CREATORS_NO_EMAIL_NOTICE,
  ADMIN_CREATORS_PAGE_SIZE,
  type AdminCreatorRow,
  type ClaimFilter,
  formatCreatedAt,
  summarizeAdminCreatorsPage,
} from "@/lib/cabana-admin-creators";
import { useAdminCreators } from "@/lib/use-admin-creators";

const CLAIM_TABS: { value: ClaimFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claimed", label: "Claimed" },
  { value: "unclaimed", label: "Unclaimed" },
];

export function CreatorDirectory() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [claimed, setClaimed] = useState<ClaimFilter>("all");
  const [page, setPage] = useState(0);

  // Debounce the server query so typing doesn't fire a request per keystroke.
  // Filtering is SERVER-side (the pure module builds the PostgREST filter) — it
  // is not a client-side filter over one page pretending to be a search.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const query = { page, pageSize: ADMIN_CREATORS_PAGE_SIZE, search, claimed };
  const creators = useAdminCreators(query);

  const data = creators.data;
  const summary = summarizeAdminCreatorsPage({
    rows: data?.rows ?? [],
    total: data?.total ?? null,
    page,
    pageSize: ADMIN_CREATORS_PAGE_SIZE,
  });

  return (
    <section className="space-y-5" aria-label="Creator directory">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1 sm:max-w-sm">
          <span className="sr-only">Search creators by handle or name</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search handle or name…"
            className="glass min-h-11 w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-white/20"
          />
        </label>

        <div
          className="flex items-center gap-1 rounded-full bg-white/5 p-1"
          role="group"
          aria-label="Filter by claim status"
        >
          {CLAIM_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setClaimed(tab.value);
                setPage(0);
              }}
              aria-pressed={claimed === tab.value}
              className={`inline-flex min-h-11 items-center rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                claimed === tab.value
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {ADMIN_CREATORS_NO_EMAIL_NOTICE}
      </p>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {creators.isError ? (
        <QueryErrorState
          title="Couldn’t load creators"
          message="The creator directory didn’t load. This surface never shows placeholder rows, so nothing is displayed."
          onRetry={() => void creators.refetch()}
        />
      ) : creators.isPending ? (
        <DirectorySkeleton />
      ) : summary.isEmpty ? (
        <EmptyState
          icon={Users}
          title={search || claimed !== "all" ? "No creators match" : "No creators yet"}
          description={
            search || claimed !== "all"
              ? "Try a different search term or clear the filter."
              : "Creator profiles appear here as soon as accounts exist."
          }
        />
      ) : (
        <div className="glass overflow-hidden rounded-3xl">
          <div className="hidden grid-cols-[2fr_1.6fr_1fr_0.8fr_1fr] gap-4 border-b border-border/50 px-6 py-4 text-xs uppercase tracking-[0.18em] text-muted-foreground md:grid">
            <div>Creator</div>
            <div>Public page</div>
            <div>Status</div>
            <div>Links</div>
            <div>Created</div>
          </div>
          {(data?.rows ?? []).map((row) => (
            <CreatorRow key={row.id} row={row} />
          ))}
        </div>
      )}

      {/* ── Pager ────────────────────────────────────────────────────────── */}
      {!creators.isError && !summary.isEmpty && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground" data-testid="page-summary">
            {summary.label}
            {summary.pageCount !== null && summary.pageCount > 1 ? (
              <span className="ml-2 text-muted-foreground/60">
                · page {page + 1} of {summary.pageCount}
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!summary.hasPrev || creators.isFetching}
              className="btn-ghost min-h-11 !px-3 !py-2 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!summary.hasNext || creators.isFetching}
              className="btn-ghost min-h-11 !px-3 !py-2 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CreatorRow({ row }: { row: AdminCreatorRow }) {
  return (
    <div className="grid grid-cols-1 items-center gap-y-3 border-b border-border/30 px-6 py-4 last:border-0 hover:bg-foreground/[0.03] md:grid-cols-[2fr_1.6fr_1fr_0.8fr_1fr] md:gap-4">
      {/* Creator */}
      <div className="flex min-w-0 items-center gap-3">
        {row.avatarUrl ? (
          <img
            src={row.avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
            <UserRound className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.displayName}</p>
          {row.excerpt ? (
            <p className="truncate text-xs text-muted-foreground">{row.excerpt}</p>
          ) : null}
        </div>
      </div>

      {/* Public page */}
      <div className="min-w-0">
        <a
          href={row.publicPath}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">{row.publicUrl}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <p className="text-[11px] text-muted-foreground/60">
          {row.theme} · {row.buttonStyle}
        </p>
      </div>

      {/* Status */}
      <div>
        <ClaimBadge claimed={row.claimed} />
      </div>

      {/* Links */}
      <div className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        {row.linkCount}
      </div>

      {/* Created */}
      <div className="text-xs text-muted-foreground">{formatCreatedAt(row.createdAt)}</div>
    </div>
  );
}

function ClaimBadge({ claimed }: { claimed: boolean }) {
  return claimed ? (
    <span className="inline-flex rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
      Claimed
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
      Unclaimed
    </span>
  );
}

function DirectorySkeleton() {
  return (
    <div className="glass space-y-3 rounded-3xl p-6" aria-busy="true" aria-label="Loading creators">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-white/5" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
