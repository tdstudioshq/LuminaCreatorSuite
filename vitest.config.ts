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
      // Pure/testable business layer (money, entitlements, accounts,
      // relationships, posts).
      include: [
        "src/lib/cabana-money.ts",
        "src/lib/cabana-entitlements.ts",
        "src/lib/cabana-account.ts",
        "src/lib/cabana-relationships.ts",
        "src/lib/cabana-posts.ts",
        "src/lib/cabana-engagement.ts",
        "src/lib/cabana-subscriptions.ts",
        "src/lib/cabana-messaging.ts",
        "src/lib/cabana-notifications.ts",
        "src/lib/cabana-moderation.ts",
        "src/lib/cabana-finance.ts",
        "src/lib/cabana-payouts.ts",
        "src/lib/cabana-notification-engine.ts",
        "src/lib/cabana-discovery.ts",
        "src/lib/cabana-dashboard.ts",
        "src/lib/cabana-creator-analytics.ts",
        "src/lib/cabana-redirect.ts",
        "src/lib/cabana-stream.ts",
        "src/lib/cabana-stream-upload.ts",
        "src/lib/cabana-admin-creators.ts",
        "src/lib/cabana-creator-pages.ts",
        "src/lib/cabana-admin-roles.ts",
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
