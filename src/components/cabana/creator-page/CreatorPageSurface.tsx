import type { ReactNode } from "react";
import type { CabanaProfile } from "@/lib/cabana-creator-page-view";
import { creatorPageSurfaceStyle } from "./creator-page-style";

export function CreatorPageSurface({
  profile,
  children,
  className = "",
}: {
  profile: Pick<CabanaProfile, "theme" | "pageStatus" | "fontFamily" | "backgroundStyle">;
  children: ReactNode;
  className?: string;
}) {
  const transparentShell =
    profile.backgroundStyle === "default" ? "" : "[&>.social-app-shell]:!bg-transparent";

  return (
    <div
      className={`relative min-h-screen overflow-x-hidden ${transparentShell} ${className}`.trim()}
      data-cabana-theme={profile.theme}
      data-creator-page-status={profile.pageStatus}
      data-creator-page-font={profile.fontFamily}
      data-creator-page-background={profile.backgroundStyle}
      style={creatorPageSurfaceStyle(profile.fontFamily, profile.backgroundStyle)}
    >
      {children}
    </div>
  );
}
