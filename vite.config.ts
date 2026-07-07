// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Deploy target. Nitro's Vercel preset emits `.vercel/output` (Build Output API
  // with a serverless function) so Vercel can serve the SSR app. Without this the
  // wrapper defaults to `cloudflare-module` and Vercel gets a static bundle → 404.
  //
  // The wrapper force-overrides Nitro's `output` paths with Cloudflare-shaped ones
  // (dist/client, dist/server), which breaks the Vercel Build Output layout. We
  // restore the vercel preset's own templated paths (it merges ours last, so they
  // win) — functions/__server.func + static under .vercel/output.
  nitro: {
    preset: "vercel",
    output: {
      dir: "{{ rootDir }}/.vercel/output",
      serverDir: "{{ output.dir }}/functions/__server.func",
      publicDir: "{{ output.dir }}/static/{{ baseURL }}",
    },
  },
  // Dev-server stability: pre-bundle all runtime deps on startup so Vite never
  // discovers a NEW dependency mid-navigation and re-runs its optimizer. That
  // mid-load re-optimization invalidates in-flight optimized chunks, which the
  // browser sees as 504 "Outdated Optimize Dep" / "Failed to fetch dynamically
  // imported module" — and Vite flashes its full-screen error overlay (raw
  // JS / stack trace) for a moment before auto-reloading. Because route code is
  // split, deps only used on lazy routes (recharts on the dashboard, the icon
  // packs on link pages, etc.) were being discovered late and triggering that
  // flash. Listing them here forces a single optimize pass at server start, so
  // users never see the raw-JS overlay during load/reload. Build is unaffected.
  vite: {
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "framer-motion",
        "lucide-react",
        "sonner",
        "@supabase/supabase-js",
        "recharts",
        "react-icons",
        "react-icons/fa6",
        "react-social-icons",
        "simple-icons",
        "date-fns",
        "clsx",
        "tailwind-merge",
        "class-variance-authority",
        "zod",
        "react-hook-form",
        "@hookform/resolvers",
        "input-otp",
        "cmdk",
        "vaul",
        "embla-carousel-react",
        "react-day-picker",
        "react-resizable-panels",
        "@radix-ui/react-accordion",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-aspect-ratio",
        "@radix-ui/react-avatar",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-collapsible",
        "@radix-ui/react-context-menu",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-hover-card",
        "@radix-ui/react-label",
        "@radix-ui/react-menubar",
        "@radix-ui/react-navigation-menu",
        "@radix-ui/react-popover",
        "@radix-ui/react-progress",
        "@radix-ui/react-radio-group",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-select",
        "@radix-ui/react-separator",
        "@radix-ui/react-slider",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tabs",
        "@radix-ui/react-toggle",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-tooltip",
      ],
    },
  },
});
