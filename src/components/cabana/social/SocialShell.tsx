import type { ReactNode } from "react";
import { SocialNav } from "./SocialNav";
import { SocialRightRail } from "./SocialRightRail";

/**
 * Three-column scaffold for the social surfaces (OnlyFans-style structure):
 * fixed left navigation · center content · contextual right rail.
 *
 * Structure/composition only — every child keeps the existing dark luxury
 * glass theme. Responsive: the left nav collapses to a bottom tab bar below
 * `lg`, and the right rail is hidden below `xl`.
 *
 * Pass `rightRail={null}` to suppress the rail, or a node to override it.
 */
export function SocialShell({
  children,
  rightRail,
  wide = false,
}: {
  children: ReactNode;
  rightRail?: ReactNode | null;
  wide?: boolean;
}) {
  const showRail = rightRail !== null;

  return (
    <div className="social-app-shell relative min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-64 left-[18%] h-[640px] w-[640px] rounded-full bg-iridescent opacity-[0.09] blur-[170px]" />
        <div className="absolute -bottom-80 right-[-10%] h-[620px] w-[620px] rounded-full bg-iridescent opacity-[0.05] blur-[180px]" />
        <div className="absolute inset-0 bg-[linear-gradient(oklch(1_0_0/0.018)_1px,transparent_1px)] bg-[size:100%_64px] opacity-40" />
      </div>

      <SocialNav />

      <div className="relative z-10 lg:pl-[280px]">
        <div
          className={`mx-auto flex min-h-screen w-full pb-24 lg:pb-0 ${
            wide ? "max-w-[1440px]" : "max-w-[1120px]"
          }`}
        >
          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
          {showRail && (
            <aside className="hidden w-[360px] shrink-0 border-l border-white/[0.07] xl:block">
              <div className="sticky top-0 max-h-screen overflow-y-auto px-7 py-6">
                {rightRail ?? <SocialRightRail />}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
