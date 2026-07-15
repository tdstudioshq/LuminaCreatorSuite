import { useState } from "react";
import { Check, Clipboard, ExternalLink, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { CreatorPageLinks } from "@/components/cabana/creator-page/CreatorPageLinks";
import { CreatorPageSurface } from "@/components/cabana/creator-page/CreatorPageSurface";
import { Button } from "@/components/ui/button";
import type { CabanaLink, CabanaProfile } from "@/lib/cabana-creator-page-view";
import { PUBLIC_SITE_DOMAIN } from "@/lib/site";

export function AdminCreatorPagePreview({
  profile,
  links,
  publicHandle,
}: {
  profile: CabanaProfile;
  links: readonly CabanaLink[];
  publicHandle: string;
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [copied, setCopied] = useState(false);
  const publicUrl = `https://${PUBLIC_SITE_DOMAIN}/${publicHandle}`;
  const isPublic = profile.pageStatus === "published";
  const handleHasUnsavedChanges = profile.handle !== publicHandle;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Public creator URL copied.");
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast.error("Couldn’t copy the public URL.");
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="creator-preview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="creator-preview-title" className="font-display text-xl font-semibold">
            Live preview
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Uses the same appearance and link presentation as the public creator page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex rounded-lg border border-border/60 p-1"
            role="group"
            aria-label="Preview width"
          >
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              aria-pressed={device === "mobile"}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs ${
                device === "mobile" ? "bg-white/10 text-foreground" : "text-muted-foreground"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </button>
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              aria-pressed={device === "desktop"}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs ${
                device === "desktop" ? "bg-white/10 text-foreground" : "text-muted-foreground"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyUrl()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            Copy URL
          </Button>
          {isPublic ? (
            <Button asChild variant="ghost" size="sm">
              <a href={`/${publicHandle}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {!isPublic ? (
        <p
          className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"
          role="status"
        >
          This {profile.pageStatus} page is not publicly visible. The preview is available to admins
          only.
        </p>
      ) : null}

      {handleHasUnsavedChanges ? (
        <p
          className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-xs text-sky-200"
          role="status"
        >
          The preview uses the unsaved handle @{profile.handle}. Copy and Open still use the saved
          public URL @{publicHandle} until you save.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-black/20 p-3 sm:p-5">
        <div
          data-preview-device={device}
          className={`mx-auto overflow-hidden rounded-[1.75rem] border border-white/10 shadow-2xl transition-[max-width] ${
            device === "mobile" ? "max-w-[390px]" : "max-w-[920px]"
          }`}
        >
          <CreatorPageSurface profile={profile} className="bg-background">
            <div className="mx-auto min-h-[640px] max-w-[720px] bg-background/45">
              <header className="flex h-14 items-center border-b border-white/[0.07] px-5">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold">
                    {profile.name || `@${profile.handle}`}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">@{profile.handle}</p>
                </div>
              </header>
              <div className="relative h-40 overflow-hidden border-b border-white/[0.08] bg-white/[0.035] sm:h-52">
                {profile.banner ? (
                  <img
                    src={profile.banner}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-iridescent opacity-75" />
                    <div className="absolute -left-12 top-3 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
                  </>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/20" />
              </div>
              <div className="px-5 pb-7">
                <span className="-mt-12 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-iridescent text-xl font-semibold text-background ring-4 ring-background">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.name || `@${profile.handle}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (profile.name || profile.handle).slice(0, 1).toUpperCase()
                  )}
                </span>
                <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight">
                  {profile.name || `@${profile.handle}`}
                </h3>
                {profile.headline ? (
                  <p
                    className="mt-1 text-sm font-medium"
                    style={profile.accentColor ? { color: profile.accentColor } : undefined}
                  >
                    {profile.headline}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">@{profile.handle}</p>
                {profile.bio ? (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                    {profile.bio}
                  </p>
                ) : null}
                <div className="mt-6">
                  <CreatorPageLinks
                    links={links}
                    accentColor={profile.accentColor}
                    buttonStyle={profile.buttonStyle}
                  />
                </div>
              </div>
            </div>
          </CreatorPageSurface>
        </div>
      </div>
    </section>
  );
}
