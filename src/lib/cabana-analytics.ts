/**
 * CABANA analytics — fire-and-forget event tracking against `analytics_events`.
 * RLS allows anyone to insert events for any real creator profile.
 */
import { supabase } from "@/integrations/supabase/client";

export type CabanaEventType = "page_view" | "link_click" | "product_click";

type TrackOptions = {
  profileId: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

async function track(eventType: CabanaEventType, opts: TrackOptions) {
  if (!opts.profileId) return;
  try {
    await supabase.from("analytics_events").insert({
      event_type: eventType,
      profile_id: opts.profileId,
      target_id: opts.targetId ?? null,
      metadata: (opts.metadata ?? {}) as never,
    });
  } catch {
    // Silently swallow — analytics must never break the user experience.
  }
}

export const trackPageView = (profileId: string, metadata?: Record<string, unknown>) =>
  track("page_view", { profileId, metadata });

export const trackLinkClick = (
  profileId: string,
  linkId: string,
  metadata?: Record<string, unknown>,
) => track("link_click", { profileId, targetId: linkId, metadata });

export const trackProductClick = (
  profileId: string,
  productId: string,
  metadata?: Record<string, unknown>,
) => track("product_click", { profileId, targetId: productId, metadata });
