// Standalone Vitest config. Intentionally NOT the Lovable vite.config.ts —
// the helpers under test are pure (no React/Supabase/browser), so they need
// only the `@` path alias, not the full app plugin stack.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      // Phase 1 targets the pure business-logic layer only.
      include: ["src/lib/cabana-money.ts", "src/lib/cabana-entitlements.ts"],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
