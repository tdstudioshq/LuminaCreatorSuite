import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The single source of truth for buttons across CABANA. Every variant shares
 * the liquid-metal design language:
 *  - "metal" finishes (primary/cta/secondary/destructive/success) layer the
 *    shared `.btn-metal` base (gloss + bevel + hover sheen + tactile press,
 *    defined once in styles.css) and only swap `--metal-body` / `--metal-fg`.
 *  - Low-emphasis finishes (ghost/outline/icon/toolbar/nav/link) keep the same
 *    radius, easing, and focus language without the chrome fill.
 * Semantics are untouched: `type`, `aria-*`, keyboard behavior, `asChild`, and
 * form-submit defaults all pass straight through.
 */
const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--metal-radius)] font-medium outline-none transition-[transform,box-shadow,background,filter,color,border-color] duration-200 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // ── Metal finishes (share .btn-metal; vary only body + text) ──
        primary: "btn-metal",
        cta: "btn-metal",
        secondary:
          "btn-metal [--metal-body:var(--gradient-metal-silver)] [--metal-fg:oklch(0.18_0.02_280)]",
        destructive:
          "btn-metal [--metal-body:var(--gradient-metal-destructive)] [--metal-fg:oklch(0.99_0_0)] [--metal-ring:oklch(0.65_0.22_25/0.9)]",
        success:
          "btn-metal [--metal-body:var(--gradient-metal-success)] [--metal-fg:oklch(0.16_0.02_160)] [--metal-ring:oklch(0.7_0.16_155/0.9)]",
        // ── Low-emphasis finishes ──
        ghost: "btn-ghost",
        icon: "btn-ghost !rounded-full",
        outline:
          "border border-border bg-transparent text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.05] active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        toolbar:
          "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring",
        nav: "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-foreground",
        link: "text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10 p-0",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Show a premium spinner and disable interaction (only runs during loading). */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const classes = cn(buttonVariants({ variant, size, fullWidth, className }));

    // asChild renders a single arbitrary child (e.g. a router Link); we must
    // not inject extra nodes or a `disabled` attr it can't take.
    if (asChild) {
      return (
        <Comp className={classes} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <button className={classes} ref={ref} disabled={disabled || loading} {...props}>
        {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
