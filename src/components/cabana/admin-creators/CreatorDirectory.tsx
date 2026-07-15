// ============================================================================
// CABANA — admin creator directory
// ----------------------------------------------------------------------------
// PRESENTATION ONLY. Every decision — query clamping, search sanitization, row
// mapping, page summary — comes from the pure `cabana-admin-creators` module.
//
// Rows link to the protected creator-page editor; no mutation occurs from this
// list. Email remains absent because the editor uses trusted profile data and an
// exact UUID ownership control rather than exposing auth.users.
// ============================================================================
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, FilePlus2, Link2, Search, Settings2, UserRound, Users } from "lucide-react";
import { EmptyState } from "@/components/cabana/EmptyState";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import {
  ADMIN_CREATORS_NO_EMAIL_NOTICE,
  ADMIN_CREATORS_PAGE_SIZE,
  type AdminCreatorRow,
  type ClaimFilter,
  type LifecycleFilter,
  formatCreatedAt,
  summarizeAdminCreatorsPage,
} from "@/lib/cabana-admin-creators";
import { useAdminCreators } from "@/lib/use-admin-creators";

const CLAIM_TABS: { value: ClaimFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claimed", label: "Claimed" },
  { value: "unclaimed", label: "Unclaimed" },
];

const LIFECYCLE_OPTIONS: { value: LifecycleFilter; label: string }[] = [
  { value: "all", label: "All lifecycle states" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function CreatorDirectory() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [claimed, setClaimed] = useState<ClaimFilter>("all");
  const [status, setStatus] = useState<LifecycleFilter>("all");
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

  const query = { page, pageSize: ADMIN_CREATORS_PAGE_SIZE, search, claimed, status };
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

        <div className="flex flex-wrap items-center gap-2">
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
          <label>
            <span className="sr-only">Filter by page lifecycle</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as LifecycleFilter);
                setPage(0);
              }}
              className="min-h-11 rounded-full border border-border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {LIFECYCLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Link
            to="/admin/creators/new"
            className="btn-luxury inline-flex min-h-11 items-center gap-2 !rounded-full !px-4 !py-2 text-xs"
          >
            <FilePlus2 className="h-3.5 w-3.5" /> New page
          </Link>
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
          title={
            search || claimed !== "all" || status !== "all"
              ? "No creators match"
              : "No creators yet"
          }
          description={
            search || claimed !== "all" || status !== "all"
              ? "Try a different search term or clear the filter."
              : "Creator profiles appear here as soon as accounts exist."
          }
        />
      ) : (
        <div className="glass overflow-hidden rounded-3xl">
          <div className="hidden grid-cols-[1.8fr_1.5fr_0.9fr_0.6fr_0.9fr_auto] gap-4 border-b border-border/50 px-6 py-4 text-xs uppercase tracking-[0.18em] text-muted-foreground md:grid">
            <div>Creator</div>
            <div>Public page</div>
            <div>Status</div>
            <div>Links</div>
            <div>Created</div>
            <div className="sr-only">Actions</div>
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
    <div className="grid grid-cols-1 items-center gap-y-3 border-b border-border/30 px-6 py-4 last:border-0 hover:bg-foreground/[0.03] md:grid-cols-[1.8fr_1.5fr_0.9fr_0.6fr_0.9fr_auto] md:gap-4">
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
        <div className="flex flex-wrap gap-1.5">
          <LifecycleBadge status={row.pageStatus} />
          <ClaimBadge claimed={row.claimed} />
        </div>
      </div>

      {/* Links */}
      <div className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        {row.linkCount}
      </div>

      {/* Created */}
      <div className="text-xs text-muted-foreground">{formatCreatedAt(row.createdAt)}</div>

      <Link
        to="/admin/creators/$creatorProfileId"
        params={{ creatorProfileId: row.id }}
        className="btn-ghost inline-flex min-h-10 items-center justify-center gap-1.5 !px-3 !py-2 text-xs"
        aria-label={`Manage ${row.displayName}`}
      >
        <Settings2 className="h-3.5 w-3.5" /> Manage
      </Link>
    </div>
  );
}

function LifecycleBadge({ status }: { status: AdminCreatorRow["pageStatus"] }) {
  return (
    <span
      data-page-status={status}
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
        status === "published"
          ? "bg-emerald-400/15 text-emerald-300"
          : status === "archived"
            ? "bg-rose-400/15 text-rose-300"
            : "bg-sky-400/15 text-sky-300"
      }`}
    >
      {status}
    </span>
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
