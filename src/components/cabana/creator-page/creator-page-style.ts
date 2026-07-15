import type { CSSProperties } from "react";
import type {
  CreatorPageBackgroundStyle,
  CreatorPageFontFamily,
} from "@/lib/cabana-creator-page-view";

type CreatorPageCssProperties = CSSProperties & {
  "--font-sans"?: string;
  "--font-display"?: string;
};

const FONT_STACKS: Record<Exclude<CreatorPageFontFamily, "default">, string> = {
  sans: '"Inter", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  display: '"Space Grotesk", "Inter", system-ui, sans-serif',
};

const BACKGROUNDS: Record<Exclude<CreatorPageBackgroundStyle, "default">, CSSProperties> = {
  solid: {
    backgroundColor: "oklch(0.105 0.012 280)",
  },
  gradient: {
    backgroundColor: "oklch(0.105 0.012 280)",
    backgroundImage:
      "linear-gradient(145deg, oklch(0.18 0.045 280 / 0.72), oklch(0.105 0.012 280) 52%, oklch(0.16 0.04 220 / 0.58))",
    backgroundAttachment: "fixed",
  },
  iridescent: {
    backgroundColor: "oklch(0.105 0.012 280)",
    backgroundImage:
      "radial-gradient(circle at 18% 0%, oklch(0.72 0.18 300 / 0.2), transparent 42%), radial-gradient(circle at 88% 88%, oklch(0.76 0.14 195 / 0.16), transparent 44%)",
    backgroundAttachment: "fixed",
  },
};

/** Closed token-to-style mapping; database text is never interpolated into CSS. */
export function creatorPageSurfaceStyle(
  fontFamily: CreatorPageFontFamily,
  backgroundStyle: CreatorPageBackgroundStyle,
): CreatorPageCssProperties {
  const style: CreatorPageCssProperties =
    backgroundStyle === "default" ? {} : { ...BACKGROUNDS[backgroundStyle] };

  if (fontFamily !== "default") {
    const stack = FONT_STACKS[fontFamily];
    style["--font-sans"] = stack;
    style["--font-display"] = stack;
    style.fontFamily = stack;
  }

  return style;
}
