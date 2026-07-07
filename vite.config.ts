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
});
