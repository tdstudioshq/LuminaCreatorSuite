import type { ShaderMount } from "@paper-design/shaders";
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Hero CTA button with a live WebGL liquid-metal fill (Paper shaders).
 *
 * Guardrails (see the project button-system spec):
 *  - **One live WebGL context at a time, app-wide.** A module-level guard means
 *    only the first mounted instance runs the shader; any others (or SSR,
 *    reduced-motion, or a context-creation failure) transparently fall back to
 *    the CSS `cta` Button — same size, semantics, and label.
 *  - **No idle cost.** The shader is parked at speed 0 when idle (the library
 *    stops its render loop entirely at 0), and only animates on hover/press.
 *  - **Semantics preserved.** Renders a real <button>; `type`, `onClick`,
 *    `disabled`, and aria-* pass straight through. Never a submit substitute.
 *
 * Reserve for: landing/login CTA, signup CTA, onboarding completion.
 */

let liveShaderCount = 0;
const MAX_LIVE_SHADERS = 1;

const SHADER_UNIFORMS = {
  u_repetition: 4,
  u_softness: 0.5,
  u_shiftRed: 0.3,
  u_shiftBlue: 0.3,
  u_distortion: 0,
  u_contour: 0,
  u_angle: 45,
  u_scale: 8,
  u_shape: 1,
  u_offsetX: 0.1,
  u_offsetY: -0.1,
} as const;

type LiquidMetalButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Size passed through to the CSS fallback Button (defaults to lg). */
  fallbackSize?: ButtonProps["size"];
  fullWidth?: boolean;
};

export function LiquidMetalButton({
  className,
  children,
  fallbackSize = "lg",
  fullWidth,
  disabled,
  ...props
}: LiquidMetalButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  const shaderHostRef = useRef<HTMLSpanElement>(null);
  const shaderRef = useRef<ShaderMount | null>(null);
  const [shaderActive, setShaderActive] = useState(false);

  useEffect(() => {
    // Client-only, motion-allowed, and only if we're under the global cap.
    if (prefersReducedMotion) return;
    if (typeof window === "undefined") return;
    if (!shaderHostRef.current) return;
    if (liveShaderCount >= MAX_LIVE_SHADERS) return;

    const host = shaderHostRef.current;
    let mounted: ShaderMount | null = null;
    let disposed = false;
    let claimed = false;

    // Lazy-load the WebGL shader lib so @paper-design/shaders stays OUT of the
    // eager front-door bundle (login/signup/onboarding all import this button).
    // The CSS fallback is already the default render (shaderActive=false), so
    // behavior is unchanged — the shader simply upgrades in once the chunk
    // resolves post-hydration (exactly when it did before, just code-split).
    void import("@paper-design/shaders")
      .then(({ liquidMetalFragmentShader, ShaderMount }) => {
        // Bail if we unmounted before the chunk resolved, or another instance
        // claimed the single live-shader slot in the meantime.
        if (disposed || liveShaderCount >= MAX_LIVE_SHADERS) return;
        try {
          mounted = new ShaderMount(
            host,
            liquidMetalFragmentShader,
            SHADER_UNIFORMS,
            undefined,
            0, // idle: parked → the library halts its render loop (zero cost)
          );
        } catch {
          // WebGL unavailable: ShaderMount may have appended a canvas before
          // failing — remove it so the CSS fallback host stays clean.
          host.replaceChildren();
          return;
        }
        shaderRef.current = mounted;
        liveShaderCount += 1;
        claimed = true;
        setShaderActive(true);
      })
      .catch(() => {
        // Shader chunk failed to load (offline/network) — stay on CSS fallback.
      });

    return () => {
      disposed = true;
      mounted?.dispose();
      shaderRef.current = null;
      if (claimed) liveShaderCount -= 1;
      setShaderActive(false);
    };
  }, [prefersReducedMotion]);

  // When no shader is live (SSR, reduced motion, over the cap, or WebGL
  // unavailable) the `.lm-btn--css` class paints the same metal fill in pure
  // CSS — identical size, label, and semantics, zero WebGL.
  const setSpeed = (speed: number) => shaderRef.current?.setSpeed?.(speed);

  return (
    <button
      className={cn("lm-btn", fullWidth && "w-full", !shaderActive && "lm-btn--css", className)}
      disabled={disabled}
      onMouseEnter={() => setSpeed(1)}
      onMouseLeave={() => setSpeed(0)}
      onMouseDown={() => setSpeed(2.4)}
      onMouseUp={() => setSpeed(1)}
      {...props}
    >
      <span ref={shaderHostRef} className="lm-btn__fill" aria-hidden="true" />
      <span className="lm-btn__gloss" aria-hidden="true" />
      <span className="lm-btn__label">{children}</span>
    </button>
  );
}

/**
 * SSR/CSS-only twin for surfaces that must not attempt WebGL at all (or when you
 * simply want the CSS metal CTA). Kept here so callers import one module.
 */
export function LiquidMetalButtonFallback(props: ButtonProps) {
  return <Button variant="cta" size="lg" {...props} />;
}
