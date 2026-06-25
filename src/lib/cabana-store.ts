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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ───────────────────────────── Types ─────────────────────────────
export type LinkIconKey =
  | "crown"
  | "instagram"
  | "youtube"
  | "music"
  | "shop"
  | "send"
  | "heart"
  | "calendar"
  | "globe"
  | "star"
  | "play"
  | "sparkles";

export type CabanaTheme = "iridescent" | "midnight" | "rose" | "chrome";

export type CabanaProfile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  banner: string;
  theme: CabanaTheme;
  plan: string;
};

export type CabanaLink = {
  id: string;
  title: string;
  url: string;
  icon: LinkIconKey;
  clicks: number;
  ctr: string;
  scheduled?: string;
  featured?: boolean;
  position: number;
};

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
};
export const ICON_OPTIONS: LinkIconKey[] = [
  "crown",
  "instagram",
  "youtube",
  "music",
  "shop",
  "send",
  "heart",
  "calendar",
  "globe",
  "star",
  "play",
  "sparkles",
];

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=600&q=80";

// ─────────────────────── Row mappers ───────────────────────
type CreatorRow = {
  id: string;
  user_id: string | null;
  handle: string;
  name: string;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  theme: string;
  plan: string;
};
type LinkRow = {
  id: string;
  profile_id: string;
  title: string;
  url: string;
  icon: string;
  featured: boolean;
  scheduled: string | null;
  position: number;
  clicks: number;
};
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

function mapProfile(row: CreatorRow): CabanaProfile {
  const theme = (["iridescent", "midnight", "rose", "chrome"] as const).includes(
    row.theme as CabanaTheme,
  )
    ? (row.theme as CabanaTheme)
    : "iridescent";
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    bio: row.bio,
    avatar: row.avatar_url || FALLBACK_AVATAR,
    banner: row.banner_url || "",
    theme,
    plan: row.plan,
  };
}
function mapLink(row: LinkRow, totalClicks: number): CabanaLink {
  const icon = (ICON_OPTIONS as readonly string[]).includes(row.icon)
    ? (row.icon as LinkIconKey)
    : "globe";
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    icon,
    clicks: row.clicks,
    ctr: totalClicks > 0 ? `${((row.clicks / totalClicks) * 100).toFixed(1)}%` : "0%",
    scheduled: row.scheduled ?? undefined,
    featured: row.featured,
    position: row.position,
  };
}
function mapProduct(row: ProductRow): CabanaProduct {
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    type: row.type,
    sales: row.sales,
    img: row.image_url || FALLBACK_AVATAR,
    position: row.position,
  };
}

async function fetchCreatorBundle(profile: CreatorRow): Promise<CabanaState> {
  const [linksRes, productsRes] = await Promise.all([
    supabase
      .from("links")
      .select("*")
      .eq("profile_id", profile.id)
      .order("position", { ascending: true }),
    supabase
      .from("products")
      .select("*")
      .eq("profile_id", profile.id)
      .order("position", { ascending: true }),
  ]);
  if (linksRes.error) throw linksRes.error;
  if (productsRes.error) throw productsRes.error;
  const linkRows = (linksRes.data ?? []) as LinkRow[];
  const productRows = (productsRes.data ?? []) as ProductRow[];
  const totalClicks = linkRows.reduce((s, l) => s + (l.clicks ?? 0), 0);
  return {
    profile: mapProfile(profile),
    links: linkRows.map((l) => mapLink(l, totalClicks)),
    products: productRows.map(mapProduct),
  };
}

// ─────────────────────── Public hooks ───────────────────────
export function useCreatorByHandle(handle: string | undefined) {
  return useQuery({
    queryKey: ["creator-by-handle", handle?.toLowerCase()],
    enabled: !!handle,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_profiles")
        .select("*")
        .ilike("handle", handle!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return fetchCreatorBundle(data as CreatorRow);
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
      return fetchCreatorBundle(data as CreatorRow);
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
          Pick<CabanaProfile, "name" | "handle" | "bio" | "theme" | "avatar" | "banner">
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
          const { error } = await supabase
            .from("creator_profiles")
            .update(update as any)
            .eq("user_id", userId);
          if (error) throw error;
        }),

      // ─── links ───
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
