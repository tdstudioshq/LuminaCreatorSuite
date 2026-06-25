import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/docs/data-model")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      {
        name: "description",
        content: "CABANA V1 internal data model — tables, fields, types, and purposes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DataModelDocs,
});

type Field = {
  name: string;
  type: string;
  purpose: string;
  pk?: boolean;
  fk?: string;
  nullable?: boolean;
};
type Table = { name: string; purpose: string; fields: Field[] };

const TABLES: Table[] = [
  {
    name: "users",
    purpose:
      "Authenticated accounts. Mirrors auth.users (Supabase Auth). One row per signed-up account.",
    fields: [
      { name: "id", type: "uuid", purpose: "Primary key. Mirrors auth.users.id.", pk: true },
      { name: "email", type: "text", purpose: "Account email (unique, lowercased)." },
      { name: "name", type: "text", purpose: "Display name shown in Studio." },
      {
        name: "role",
        type: "app_role",
        purpose: "Enum: 'creator' | 'admin'. Stored in user_roles for RLS — see note.",
      },
      { name: "created_at", type: "timestamptz", purpose: "Account creation time." },
      {
        name: "last_login_at",
        type: "timestamptz",
        purpose: "Last successful sign-in.",
        nullable: true,
      },
    ],
  },
  {
    name: "creator_profiles",
    purpose: "Public-facing creator presence. One row per user. Drives /[username] page.",
    fields: [
      { name: "id", type: "uuid", purpose: "Primary key.", pk: true },
      { name: "user_id", type: "uuid", purpose: "Owner.", fk: "users.id" },
      { name: "handle", type: "text", purpose: "URL slug (unique, lowercase, a-z0-9-)." },
      { name: "display_name", type: "text", purpose: "Public creator name shown in hero." },
      { name: "bio", type: "text", purpose: "Short bio / tagline.", nullable: true },
      {
        name: "avatar_url",
        type: "text",
        purpose: "Profile photo (storage path or external URL).",
        nullable: true,
      },
      { name: "cover_url", type: "text", purpose: "Optional hero/cover media.", nullable: true },
      {
        name: "theme",
        type: "text",
        purpose: "Theme key: 'iridescent' | 'midnight' | 'rose' | 'chrome' | 'neon' | 'editorial'.",
      },
      { name: "verified", type: "boolean", purpose: "Verified badge flag." },
      {
        name: "follower_count",
        type: "integer",
        purpose: "Aggregated/social-imported follower total.",
      },
      {
        name: "social_links",
        type: "jsonb",
        purpose: "Connected handles: { instagram, tiktok, youtube, x, spotify }.",
      },
      { name: "created_at", type: "timestamptz", purpose: "Created timestamp." },
      { name: "updated_at", type: "timestamptz", purpose: "Last edit timestamp." },
    ],
  },
  {
    name: "links",
    purpose:
      "Smart-link blocks shown on the public creator page. Reorderable, schedulable, trackable.",
    fields: [
      { name: "id", type: "uuid", purpose: "Primary key.", pk: true },
      {
        name: "profile_id",
        type: "uuid",
        purpose: "Owning creator profile.",
        fk: "creator_profiles.id",
      },
      { name: "title", type: "text", purpose: "Visible label (e.g. 'VIP Access')." },
      { name: "url", type: "text", purpose: "Destination URL or deep-link." },
      {
        name: "icon",
        type: "text",
        purpose: "Icon key from registry: 'crown' | 'instagram' | 'youtube' | …",
      },
      { name: "position", type: "integer", purpose: "Sort order (lower = higher on page)." },
      { name: "featured", type: "boolean", purpose: "Renders as the premium spotlight block." },
      {
        name: "scheduled_at",
        type: "timestamptz",
        purpose: "If set in future, hidden until this time.",
        nullable: true,
      },
      {
        name: "expires_at",
        type: "timestamptz",
        purpose: "If set, hidden after this time.",
        nullable: true,
      },
      { name: "is_active", type: "boolean", purpose: "Soft on/off toggle." },
      {
        name: "click_count",
        type: "integer",
        purpose: "Materialized counter (also derivable from analytics_events).",
      },
      { name: "created_at", type: "timestamptz", purpose: "Created timestamp." },
      { name: "updated_at", type: "timestamptz", purpose: "Last edit timestamp." },
    ],
  },
  {
    name: "products",
    purpose: "Storefront items: physical goods, digital downloads, memberships.",
    fields: [
      { name: "id", type: "uuid", purpose: "Primary key.", pk: true },
      {
        name: "profile_id",
        type: "uuid",
        purpose: "Owning creator profile.",
        fk: "creator_profiles.id",
      },
      { name: "title", type: "text", purpose: "Product title." },
      {
        name: "description",
        type: "text",
        purpose: "Long-form product description.",
        nullable: true,
      },
      {
        name: "type",
        type: "product_type",
        purpose: "Enum: 'physical' | 'download' | 'membership'.",
      },
      {
        name: "price_cents",
        type: "integer",
        purpose: "Price in minor currency units (e.g. cents).",
      },
      { name: "currency", type: "text", purpose: "ISO 4217 (e.g. 'USD', 'EUR')." },
      {
        name: "image_url",
        type: "text",
        purpose: "Cover image (storage path or external URL).",
        nullable: true,
      },
      {
        name: "stripe_price_id",
        type: "text",
        purpose: "Stripe Price ID for checkout linking.",
        nullable: true,
      },
      {
        name: "inventory",
        type: "integer",
        purpose: "Stock count for physical items. NULL = unlimited.",
        nullable: true,
      },
      { name: "sales_count", type: "integer", purpose: "Materialized lifetime sales counter." },
      { name: "is_active", type: "boolean", purpose: "Visible on storefront when true." },
      { name: "created_at", type: "timestamptz", purpose: "Created timestamp." },
      { name: "updated_at", type: "timestamptz", purpose: "Last edit timestamp." },
    ],
  },
  {
    name: "leads",
    purpose:
      "Captured fans: newsletter signups, VIP requests, booking inquiries, brand-partnership leads.",
    fields: [
      { name: "id", type: "uuid", purpose: "Primary key.", pk: true },
      {
        name: "profile_id",
        type: "uuid",
        purpose: "Creator the lead belongs to.",
        fk: "creator_profiles.id",
      },
      { name: "email", type: "text", purpose: "Lead email address." },
      { name: "name", type: "text", purpose: "Optional submitted name.", nullable: true },
      {
        name: "source",
        type: "text",
        purpose:
          "Where the lead came in: 'newsletter' | 'vip' | 'booking' | 'partnership' | 'other'.",
      },
      {
        name: "message",
        type: "text",
        purpose: "Free-form note from the fan/brand.",
        nullable: true,
      },
      {
        name: "metadata",
        type: "jsonb",
        purpose: "Arbitrary form payload (utm, referrer, custom fields).",
      },
      { name: "status", type: "text", purpose: "'new' | 'contacted' | 'converted' | 'archived'." },
      { name: "created_at", type: "timestamptz", purpose: "Submission time." },
    ],
  },
  {
    name: "analytics_events",
    purpose: "Append-only event log. Powers dashboard charts and per-link analytics.",
    fields: [
      { name: "id", type: "uuid", purpose: "Primary key.", pk: true },
      {
        name: "profile_id",
        type: "uuid",
        purpose: "Creator the event was attributed to.",
        fk: "creator_profiles.id",
      },
      {
        name: "event_type",
        type: "text",
        purpose:
          "'page_view' | 'link_click' | 'product_view' | 'product_purchase' | 'lead_submit'.",
      },
      {
        name: "target_id",
        type: "uuid",
        purpose: "Subject of the event (link.id, product.id, etc.).",
        nullable: true,
      },
      { name: "session_id", type: "text", purpose: "Anonymous visitor session identifier." },
      {
        name: "country",
        type: "text",
        purpose: "ISO country code (audience demographics).",
        nullable: true,
      },
      { name: "city", type: "text", purpose: "City name from IP lookup.", nullable: true },
      { name: "device", type: "text", purpose: "'mobile' | 'tablet' | 'desktop'.", nullable: true },
      { name: "referrer", type: "text", purpose: "HTTP referrer host.", nullable: true },
      { name: "utm", type: "jsonb", purpose: "{ source, medium, campaign, term, content }." },
      { name: "created_at", type: "timestamptz", purpose: "Event timestamp." },
    ],
  },
  {
    name: "subscriptions",
    purpose:
      "Active CABANA platform subscriptions per creator (Free / Pro / VIP). Synced from Stripe.",
    fields: [
      { name: "id", type: "uuid", purpose: "Primary key.", pk: true },
      { name: "user_id", type: "uuid", purpose: "Subscribing creator.", fk: "users.id" },
      { name: "plan", type: "text", purpose: "'free' | 'pro' | 'vip'." },
      {
        name: "status",
        type: "text",
        purpose: "'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'.",
      },
      { name: "stripe_customer_id", type: "text", purpose: "Stripe Customer ID.", nullable: true },
      {
        name: "stripe_subscription_id",
        type: "text",
        purpose: "Stripe Subscription ID.",
        nullable: true,
      },
      {
        name: "current_period_start",
        type: "timestamptz",
        purpose: "Current billing period start.",
        nullable: true,
      },
      {
        name: "current_period_end",
        type: "timestamptz",
        purpose: "Current billing period end (renewal date).",
        nullable: true,
      },
      { name: "cancel_at_period_end", type: "boolean", purpose: "Scheduled cancellation flag." },
      { name: "created_at", type: "timestamptz", purpose: "Subscription record creation." },
      { name: "updated_at", type: "timestamptz", purpose: "Last sync from Stripe webhook." },
    ],
  },
];

function DataModelDocs() {
  return (
    <div className="relative min-h-screen px-4 py-16 lg:py-24">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full bg-iridescent opacity-15 blur-[140px]" />
        <div
          className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full opacity-15 blur-[120px]"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.2 330 / 0.6), transparent 70%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-4xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to home
        </Link>

        <header className="mt-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            <Database className="w-3.5 h-3.5" /> Internal · Engineering
          </div>
          <h1 className="mt-3 font-display text-4xl lg:text-5xl font-semibold tracking-tighter text-iridescent">
            CABANA V1 — Data Model
          </h1>
          <p className="mt-4 text-sm lg:text-base text-muted-foreground max-w-2xl leading-relaxed">
            An early proposed V1 schema sketch. Kept for historical reference only.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5 text-xs leading-relaxed text-amber-100/90">
          <p className="font-medium text-amber-200">Historical — superseded.</p>
          <p className="mt-2 text-amber-100/80">
            This page is an early proposal and does <span className="font-medium">not</span> match
            the live database or the current architecture. It may name tables, columns, themes, and
            roles that were never built. Treat the engineering blueprints as the source of truth:{" "}
            <code className="text-amber-100">CABANA_DATABASE.md</code>,{" "}
            <code className="text-amber-100">CABANA_ARCHITECTURE.md</code>, and the generated{" "}
            <code className="text-amber-100">src/integrations/supabase/types.ts</code>. The live
            schema currently uses <code className="text-amber-100">creator_profiles</code>,{" "}
            <code className="text-amber-100">links</code>,{" "}
            <code className="text-amber-100">products</code>,{" "}
            <code className="text-amber-100">analytics_events</code>,{" "}
            <code className="text-amber-100">subscriptions</code> (CABANA platform plans),{" "}
            <code className="text-amber-100">user_roles</code>, and{" "}
            <code className="text-amber-100">reserved_handles</code>.
          </p>
        </section>

        <section className="mt-8 glass rounded-2xl p-5 text-xs leading-relaxed text-muted-foreground space-y-2">
          <p>
            <span className="text-foreground font-medium">Conventions.</span> All ids are{" "}
            <code className="text-foreground">uuid</code> with{" "}
            <code className="text-foreground">gen_random_uuid()</code>. All timestamps are{" "}
            <code className="text-foreground">timestamptz</code> in UTC. Money is stored as integer
            minor units in <code className="text-foreground">price_cents</code> with an explicit ISO
            currency.
          </p>
          <p>
            <span className="text-foreground font-medium">Auth.</span>{" "}
            <code className="text-foreground">users.id</code> mirrors{" "}
            <code className="text-foreground">auth.users.id</code>. Roles must live in a separate{" "}
            <code className="text-foreground">user_roles</code> table to avoid RLS recursion (never
            store roles on profiles).
          </p>
          <p>
            <span className="text-foreground font-medium">RLS.</span> Every table is RLS-enabled.
            Default policy: a row is readable/writable by the owning{" "}
            <code className="text-foreground">user_id</code> (resolved through{" "}
            <code className="text-foreground">creator_profiles</code> when needed).{" "}
            <code className="text-foreground">analytics_events</code> is insert-only from the public
            client; reads are restricted to the owning creator.
          </p>
        </section>

        <div className="mt-10 space-y-10">
          {TABLES.map((t) => (
            <TableCard key={t.name} table={t} />
          ))}
        </div>

        <footer className="mt-16 pt-6 border-t border-border/40 text-[11px] text-muted-foreground">
          v1.0 · Updated for the Supabase wiring milestone. Update this file alongside any
          migration.
        </footer>
      </div>
    </div>
  );
}

function TableCard({ table }: { table: Table }) {
  return (
    <section id={table.name} className="glass-strong rounded-3xl p-6 lg:p-8 shadow-luxury">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          <span className="text-muted-foreground">table</span>{" "}
          <span className="text-foreground">{table.name}</span>
        </h2>
        <a
          href={`#${table.name}`}
          className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          #{table.name}
        </a>
      </div>
      <p className="mt-2 text-sm text-muted-foreground max-w-3xl leading-relaxed">
        {table.purpose}
      </p>

      <div className="mt-5 -mx-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground border-b border-border/50">
              <th className="font-normal py-2 px-2 w-[28%]">Field</th>
              <th className="font-normal py-2 px-2 w-[22%]">Type</th>
              <th className="font-normal py-2 px-2">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {table.fields.map((f) => (
              <tr key={f.name} className="border-b border-border/25 last:border-0 align-top">
                <td className="py-3 px-2">
                  <code className="text-foreground font-medium">{f.name}</code>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {f.pk && <Tag tone="primary">pk</Tag>}
                    {f.fk && <Tag tone="accent">fk → {f.fk}</Tag>}
                    {f.nullable && <Tag>nullable</Tag>}
                  </div>
                </td>
                <td className="py-3 px-2">
                  <code className="text-primary text-xs">{f.type}</code>
                </td>
                <td className="py-3 px-2 text-muted-foreground leading-relaxed">{f.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "primary" | "accent" }) {
  const cls =
    tone === "primary"
      ? "bg-primary/15 text-primary border-primary/30"
      : tone === "accent"
        ? "bg-accent/15 text-accent border-accent/30"
        : "bg-foreground/5 text-muted-foreground border-border/60";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] uppercase tracking-[0.15em] ${cls}`}
    >
      {children}
    </span>
  );
}
