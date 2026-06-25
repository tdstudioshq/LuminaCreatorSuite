import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import { Toaster } from "sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full bg-iridescent opacity-20 blur-[140px] pointer-events-none" />
      <div
        className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{ background: "radial-gradient(circle, oklch(0.7 0.2 195 / 0.6), transparent 70%)" }}
      />
      <div className="relative max-w-md text-center glass-strong rounded-3xl p-10 shadow-luxury">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Off-grid</div>
        <h1 className="mt-3 font-display text-7xl font-semibold tracking-tighter text-iridescent">
          404
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This page slipped out of the cabana. Let's get you back to something cinematic.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link to="/" className="btn-luxury !px-5 !py-2.5 text-xs">
            Back to home
          </Link>
          <Link to="/demo" className="btn-ghost !px-5 !py-2.5 text-xs">
            See a creator
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a0a14" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { title: "CABANA" },
      {
        name: "description",
        content:
          "Premium creator OS combining bio pages, storefronts, media kits, AI agents and analytics — cinematic, mobile-first.",
      },
      { name: "author", content: "CABANA" },
      { property: "og:title", content: "CABANA" },
      {
        property: "og:description",
        content:
          "Premium creator OS combining bio pages, storefronts, media kits, AI agents and analytics — cinematic, mobile-first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CABANA" },
      {
        name: "twitter:description",
        content:
          "Premium creator OS combining bio pages, storefronts, media kits, AI agents and analytics — cinematic, mobile-first.",
      },
      { property: "og:image", content: "https://www.cabanagrp.com/cabana-og.webp" },
      { name: "twitter:image", content: "https://www.cabanagrp.com/cabana-og.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" theme="dark" />
    </QueryClientProvider>
  );
}
