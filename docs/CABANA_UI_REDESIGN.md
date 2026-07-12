# CABANA UI/UX Redesign

## Concept

CABANA is presented as a private, editorial creator world rather than a conventional SaaS dashboard. The interface uses near-black and charcoal foundations, warm-ivory type, restrained champagne metal, crisp hairline borders, and image-led compositions. Glass is used for depth and navigation, not as decoration on every surface.

## System decisions

- **Color:** warm neutral darks replace the previous violet-first global palette. Creator-owned profile themes remain available and scoped to creator pages.
- **Typography:** a system-first grotesk display stack provides an Apple/Linear level of clarity; selective serif italics add editorial contrast on marketing surfaces.
- **Shape:** card radii are tighter and more architectural. Pills remain for compact controls, filters, and primary metallic actions.
- **Depth:** borders and tonal separation do most of the work. Glow is limited to low-opacity atmospheric light and focus/active moments.
- **Motion:** Framer Motion uses restrained opacity/position transitions. The root `MotionConfig` and CSS both respect reduced-motion preferences.
- **Responsive behavior:** social navigation becomes a safe-area-aware bottom bar; creator studio navigation becomes a horizontal mobile rail; marketing and authentication layouts collapse cleanly from split editorial compositions to a single column.
- **Accessibility:** a global skip link, visible focus treatment, semantic route headings, keyboard-safe profile tabs, labelled icon controls, 44px touch accommodations, and honest loading/error/empty states.

## Shared surfaces

- `LandingPage` owns the public marketing experience and reads featured creators only through the existing public discovery hook.
- `SocialShell` remains the member/public-profile composition root, preserving deep links and route behavior.
- `DashSidebar` and `MobileTabs` remain the creator-studio navigation source of truth.
- `LoginCard` and `AuthShell` share the new editorial authentication treatment without changing Supabase auth or redirects.
- `Button`, `LiquidMetalButton`, `EmptyState`, and `QueryErrorState` remain the reusable interaction and state primitives.

## Data and security boundaries

This redesign changes no migrations, RLS policies, grants, database functions, authentication behavior, Supabase clients, or production configuration. Existing queries and actions remain authoritative. Financial UI continues to identify money as demo-only; public marketing includes no fabricated customer counts, revenue, or performance claims.

## Backend-dependent states

- Featured creators appear only when the public discovery projection returns records.
- Storefront inventory/availability is shown only where the existing product model supports it.
- Message attachments and social scheduling remain affordances only where already supported; this redesign does not invent backend capabilities.
- Payments, payouts, subscriptions, and purchases retain their existing demo-only or backend-supported labels and behavior.
