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
      // Pure business-logic layer (Phase 1 money/entitlements + Phase 2B account).
      include: [
        "src/lib/cabana-money.ts",
        "src/lib/cabana-entitlements.ts",
        "src/lib/cabana-account.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
