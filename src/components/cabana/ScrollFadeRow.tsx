import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontally-scrollable row (mobile nav strips) with subtle edge fades that
 * appear only on the side(s) that actually overflow — signalling "more this
 * way" without dimming content when there's nothing hidden. Native scroll, so
 * keyboard focus still scrolls off-screen items into view; children keep their
 * own semantics (aria-current, etc.).
 */
export function ScrollFadeRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setFade({
        left: scrollLeft > 4,
        right: scrollLeft + clientWidth < scrollWidth - 4,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const mask =
    fade.left && fade.right
      ? "linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent)"
      : fade.right
        ? "linear-gradient(to right, #000 calc(100% - 28px), transparent)"
        : fade.left
          ? "linear-gradient(to right, transparent, #000 28px)"
          : undefined;

  return (
    <div
      ref={ref}
      className={`overflow-x-auto ${className}`}
      style={{ WebkitMaskImage: mask, maskImage: mask, scrollbarWidth: "none" }}
    >
      {children}
    </div>
  );
}
