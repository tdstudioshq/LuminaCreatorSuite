/**
 * CABANA data layer — backed by Supabase, exposed via React Query hooks.
 * Public reads use `useCreatorByHandle`. Authenticated owners use
 * `useCabana` + `useCabanaMutations`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Crown,
  Instagram,
  Youtube,
  Music2,
  ShoppingBag,
  Send,
  Heart,
  Calendar,
  Globe,
  Star,
  Play,
  Sparkles,
  Mail,
  Phone,
  Twitter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  mapCreatorLink,
  mapCreatorProfile,
  orderedVisibleCreatorLinks,
  type CabanaLink,
  type CabanaProfile,
  type CreatorLinkViewRow,
  type CreatorProfileViewRow,
  type LinkIconKey,
} from "@/lib/cabana-creator-page-view";

// ───────────────────────────── Types ─────────────────────────────
export { ICON_OPTIONS } from "@/lib/cabana-creator-page-view";
export type {
  ButtonStyle,
  CabanaLink,
  CabanaProfile,
  CabanaTheme,
  CreatorPageBackgroundStyle,
  CreatorPageFontFamily,
  CreatorPageLinkKind,
  CreatorPageStatus,
  LinkIconKey,
} from "@/lib/cabana-creator-page-view";

export type CabanaProduct = {
  id: string;
  title: string;
  price: string;
  type: "Physical" | "Download" | "Membership";
  sales: number;
  img: string;
  position: number;
};

export type CabanaState = {
  profile: CabanaProfile;
  links: CabanaLink[];
  products: CabanaProduct[];
};

// ─────────────────────── Icon registry ───────────────────────
export const LINK_ICONS: Record<LinkIconKey, typeof Crown> = {
  crown: Crown,
  instagram: Instagram,
  youtube: Youtube,
  music: Music2,
  shop: ShoppingBag,
  send: Send,
  heart: Heart,
  calendar: Calendar,
  globe: Globe,
  star: Star,
  play: Play,
  sparkles: Sparkles,
  mail: Mail,
  phone: Phone,
  x: Twitter,
};

// ─────────────────────── Row mappers ───────────────────────
type ProductRow = {
  id: string;
  profile_id: string;
  title: string;
  price: string;
  type: "Physical" | "Download" | "Membership";
  image_url: string | null;
  sales: number;
  position: number;
};

function mapProduct(row: ProductRow): CabanaProduct {
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    type: row.type,
    sales: row.sales,
    img: row.image_url || "",
    position: row.position,
  };
}

// Migration 37 is intentionally not represented in the generated cloud-schema
// types yet. Widening only these two column names preserves the typed table and
// response everywhere else while allowing the local migration fields to be
// used until types are regenerated after a controlled cloud apply.
const MIGRATION_37_PAGE_STATUS_COLUMN: string = "page_status";
const MIGRATION_37_LINK_VISIBILITY_COLUMN: string = "is_visible";
const PUBLIC_CREATOR_PROFILE_COLUMNS: string =
  "id, handle, name, bio, avatar_url, banner_url, theme, plan, headline, accent_color, button_style, page_status, font_family, background_style";
const PUBLIC_CREATOR_LINK_COLUMNS: string =
  "id, profile_id, title, url, icon, featured, scheduled, position, clicks, kind, is_visible";
const LEGACY_PUBLIC_CREATOR_PROFILE_COLUMNS =
  "id, handle, name, bio, avatar_url, banner_url, theme, plan, headline, accent_color, button_style";
const LEGACY_PUBLIC_CREATOR_LINK_COLUMNS =
  "id, profile_id, title, url, icon, featured, scheduled, position, clicks";

type QueryErrorLike = { code?: string | null; message?: string | null } | null;

/**
 * Preview compatibility while migration 37 is deliberately awaiting approval.
 * Once the column exists, no application error can enter this narrow fallback.
 * Pre-37 rows have no lifecycle/visibility fields and preserve the legacy
 * published/visible behavior; the primary query remains authoritative after apply.
 */
function isMigration37Unavailable(error: QueryErrorLike): boolean {
  if (!error || !["42703", "PGRST204"].includes(error.code ?? "")) return false;
  const message = error.message?.toLowerCase() ?? "";
  return ["page_status", "font_family", "background_style", "kind", "is_visible"].some((column) =>
    message.includes(column),
  );
}

async function fetchCreatorBundle(
  profile: CreatorProfileViewRow,
  { visibleLinksOnly = false }: { visibleLinksOnly?: boolean } = {},
): Promise<CabanaState> {
  let linksQuery = supabase
    .from("links")
    .select(visibleLinksOnly ? PUBLIC_CREATOR_LINK_COLUMNS : "*")
    .eq("profile_id", profile.id);
  if (visibleLinksOnly) {
    linksQuery = linksQuery.eq(MIGRATION_37_LINK_VISIBILITY_COLUMN, true);
  }

  const productsPromise = supabase
    .from("products")
    .select("*")
    .eq("profile_id", profile.id)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  let linksRes = (await linksQuery
    .order("position", { ascending: true })
    .order("id", { ascending: true })) as unknown as {
    data: CreatorLinkViewRow[] | null;
    error: QueryErrorLike;
  };
  if (visibleLinksOnly && isMigration37Unavailable(linksRes.error)) {
    linksRes = (await supabase
      .from("links")
      .select(LEGACY_PUBLIC_CREATOR_LINK_COLUMNS)
      .eq("profile_id", profile.id)
      .order("position", { ascending: true })
      .order("id", { ascending: true })) as unknown as {
      data: CreatorLinkViewRow[] | null;
      error: QueryErrorLike;
    };
  }
  const productsRes = await productsPromise;
  if (linksRes.error) throw linksRes.error;
  if (productsRes.error) throw productsRes.error;
  const linkRows = linksRes.data ?? [];
  const productRows = (productsRes.data ?? []) as ProductRow[];
  const totalClicks = linkRows.reduce((s, l) => s + (l.clicks ?? 0), 0);
  const mappedLinks = linkRows.map((link) => mapCreatorLink(link, totalClicks));
  return {
    profile: mapCreatorProfile(profile),
    links: visibleLinksOnly ? orderedVisibleCreatorLinks(mappedLinks) : mappedLinks,
    products: productRows.map(mapProduct),
  };
}

// ─────────────────────── Public hooks ───────────────────────
export function useCreatorByHandle(handle: string | undefined) {
  return useQuery({
    queryKey: ["creator-by-handle", handle?.toLowerCase()],
    enabled: !!handle,
    queryFn: async () => {
      // Public read: never select * — an explicit column list keeps the
      // account's auth user_id (and any future private columns) off the wire.
      let profileResult = (await supabase
        .from("creator_profiles")
        .select(PUBLIC_CREATOR_PROFILE_COLUMNS)
        .ilike("handle", handle!)
        .eq(MIGRATION_37_PAGE_STATUS_COLUMN, "published")
        .maybeSingle()) as unknown as {
        data: CreatorProfileViewRow | null;
        error: QueryErrorLike;
      };
      if (isMigration37Unavailable(profileResult.error)) {
        profileResult = (await supabase
          .from("creator_profiles")
          .select(LEGACY_PUBLIC_CREATOR_PROFILE_COLUMNS)
          .ilike("handle", handle!)
          .maybeSingle()) as unknown as {
          data: CreatorProfileViewRow | null;
          error: QueryErrorLike;
        };
      }
      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data) return null;
      return fetchCreatorBundle(profileResult.data, {
        visibleLinksOnly: true,
      });
    },
  });
}

function useUserId() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUserId(data.session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  return userId;
}

/** Signed-in creator's data. Returns null while loading or signed-out. */
export function useCabana() {
  const userId = useUserId();
  const query = useQuery({
    queryKey: ["my-creator", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_profiles")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return fetchCreatorBundle(data as unknown as CreatorProfileViewRow);
    },
  });
  return {
    data: query.data ?? null,
    profile: query.data?.profile ?? null,
    links: query.data?.links ?? [],
    products: query.data?.products ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// ─────────────────────── Mutations ───────────────────────
async function getMyProfileId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Creator profile not found");
  return data.id;
}

function uniqueFile(name: string) {
  const ext = name.includes(".") ? name.split(".").pop() : "bin";
  const id = crypto.randomUUID();
  return `${id}.${ext}`;
}

export function useCabanaMutations() {
  const qc = useQueryClient();
  const userId = useUserId();

  return useMemo(() => {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["my-creator"] });
      qc.invalidateQueries({ queryKey: ["creator-by-handle"] });
    };
    const wrap = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        const result = await fn();
        invalidate();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        toast.error(`${label}: ${msg}`);
        return null;
      }
    };

    return {
      // ─── profile ───
      setProfile: (
        patch: Partial<
          Pick<
            CabanaProfile,
            | "name"
            | "handle"
            | "bio"
            | "theme"
            | "avatar"
            | "banner"
            | "headline"
            | "accentColor"
            | "buttonStyle"
          >
        >,
      ) =>
        wrap("Couldn't save profile", async () => {
          if (!userId) throw new Error("Not signed in");
          const update: Record<string, unknown> = {};
          if (patch.name !== undefined) update.name = patch.name;
          if (patch.handle !== undefined) update.handle = patch.handle;
          if (patch.bio !== undefined) update.bio = patch.bio;
          if (patch.theme !== undefined) update.theme = patch.theme;
          if (patch.avatar !== undefined) update.avatar_url = patch.avatar;
          if (patch.banner !== undefined) update.banner_url = patch.banner;
          if (patch.headline !== undefined) update.headline = patch.headline;
          if (patch.accentColor !== undefined) update.accent_color = patch.accentColor;
          if (patch.buttonStyle !== undefined) update.button_style = patch.buttonStyle;
          const { error } = await supabase
            .from("creator_profiles")
            .update(update as any)
            .eq("user_id", userId);
          if (error) throw error;
        }),

      // ─── links ───
      // Insert one or more fully-specified links in a single round-trip,
      // appended after any existing links. Used by onboarding to persist the
      // starter links the user actually filled in.
      createLinks: (
        items: { title: string; url: string; icon: LinkIconKey; featured?: boolean }[],
      ) =>
        wrap("Couldn't save links", async () => {
          if (items.length === 0) return;
          const profileId = await getMyProfileId();
          const { data: existing } = await supabase
            .from("links")
            .select("position")
            .eq("profile_id", profileId)
            .order("position", { ascending: false })
            .limit(1);
          const startPos = existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;
          const rows = items.map((it, i) => ({
            profile_id: profileId,
            title: it.title,
            url: it.url,
            icon: it.icon,
            featured: it.featured ?? false,
            position: startPos + i,
          }));
          const { error } = await supabase.from("links").insert(rows);
          if (error) throw error;
        }),
      addLink: () =>
        wrap("Couldn't add link", async () => {
          const profileId = await getMyProfileId();
          const { data: existing } = await supabase
            .from("links")
            .select("position")
            .eq("profile_id", profileId)
            .order("position", { ascending: false })
            .limit(1);
          const nextPos = existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;
          const { error } = await supabase.from("links").insert({
            profile_id: profileId,
            title: "New link",
            url: "https://",
            icon: "globe",
            position: nextPos,
          });
          if (error) throw error;
        }),
      updateLink: (
        id: string,
        patch: Partial<Pick<CabanaLink, "title" | "url" | "icon" | "featured" | "scheduled">>,
      ) =>
        wrap("Couldn't update link", async () => {
          const update: Record<string, unknown> = {};
          if (patch.title !== undefined) update.title = patch.title;
          if (patch.url !== undefined) update.url = patch.url;
          if (patch.icon !== undefined) update.icon = patch.icon;
          if (patch.featured !== undefined) update.featured = patch.featured;
          if (patch.scheduled !== undefined) update.scheduled = patch.scheduled || null;
          const { error } = await supabase
            .from("links")
            .update(update as any)
            .eq("id", id);
          if (error) throw error;
        }),
      removeLink: (id: string) =>
        wrap("Couldn't delete link", async () => {
          const { error } = await supabase.from("links").delete().eq("id", id);
          if (error) throw error;
        }),
      setLinks: (links: CabanaLink[]) =>
        wrap("Couldn't reorder links", async () => {
          const profileId = await getMyProfileId();
          // Update positions sequentially
          await Promise.all(
            links.map((l, idx) =>
              supabase
                .from("links")
                .update({ position: idx })
                .eq("id", l.id)
                .eq("profile_id", profileId),
            ),
          );
        }),

      // ─── products ───
      addProduct: () =>
        wrap("Couldn't add product", async () => {
          const profileId = await getMyProfileId();
          const { data: existing } = await supabase
            .from("products")
            .select("position")
            .eq("profile_id", profileId)
            .order("position", { ascending: false })
            .limit(1);
          const nextPos = existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;
          const { error } = await supabase.from("products").insert({
            profile_id: profileId,
            title: "New product",
            price: "$0",
            type: "Physical",
            position: nextPos,
          });
          if (error) throw error;
        }),
      updateProduct: (
        id: string,
        patch: Partial<Pick<CabanaProduct, "title" | "price" | "type" | "img">>,
      ) =>
        wrap("Couldn't update product", async () => {
          const update: Record<string, unknown> = {};
          if (patch.title !== undefined) update.title = patch.title;
          if (patch.price !== undefined) update.price = patch.price;
          if (patch.type !== undefined) update.type = patch.type;
          if (patch.img !== undefined) update.image_url = patch.img;
          const { error } = await supabase
            .from("products")
            .update(update as any)
            .eq("id", id);
          if (error) throw error;
        }),
      removeProduct: (id: string) =>
        wrap("Couldn't delete product", async () => {
          const { error } = await supabase.from("products").delete().eq("id", id);
          if (error) throw error;
        }),

      // ─── uploads ───
      uploadAvatar: async (file: File) => {
        try {
          if (!userId) throw new Error("Not signed in");
          const path = `${userId}/${uniqueFile(file.name)}`;
          const { error } = await supabase.storage.from("avatars").upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });
          if (error) throw error;
          const {
            data: { publicUrl },
          } = supabase.storage.from("avatars").getPublicUrl(path);
          const { error: upErr } = await supabase
            .from("creator_profiles")
            .update({ avatar_url: publicUrl })
            .eq("user_id", userId);
          if (upErr) throw upErr;
          invalidate();
          toast.success("Avatar updated");
          return publicUrl;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          toast.error(msg);
          return null;
        }
      },
      uploadBanner: async (file: File) => {
        try {
          if (!userId) throw new Error("Not signed in");
          const path = `${userId}/${uniqueFile(file.name)}`;
          const { error } = await supabase.storage.from("banners").upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });
          if (error) throw error;
          const {
            data: { publicUrl },
          } = supabase.storage.from("banners").getPublicUrl(path);
          const { error: upErr } = await supabase
            .from("creator_profiles")
            .update({ banner_url: publicUrl })
            .eq("user_id", userId);
          if (upErr) throw upErr;
          invalidate();
          toast.success("Banner updated");
          return publicUrl;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          toast.error(msg);
          return null;
        }
      },
      uploadProductImage: async (productId: string, file: File) => {
        try {
          if (!userId) throw new Error("Not signed in");
          const path = `${userId}/${uniqueFile(file.name)}`;
          const { error } = await supabase.storage.from("products").upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });
          if (error) throw error;
          const {
            data: { publicUrl },
          } = supabase.storage.from("products").getPublicUrl(path);
          const { error: upErr } = await supabase
            .from("products")
            .update({ image_url: publicUrl })
            .eq("id", productId);
          if (upErr) throw upErr;
          invalidate();
          toast.success("Image updated");
          return publicUrl;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          toast.error(msg);
          return null;
        }
      },
    };
  }, [qc, userId]);
}
