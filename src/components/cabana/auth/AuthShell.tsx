import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import cabanaLogo from "@/assets/cabana-logo.png";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  logo = false,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Show the CABANA logo centered at the top of the card (replaces the small wordmark above it). */
  logo?: boolean;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-16 overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[560px] h-[560px] rounded-full bg-iridescent opacity-25 blur-[140px] animate-float" />
        <div
          className="absolute bottom-0 -right-40 w-[520px] h-[520px] rounded-full opacity-20 blur-[140px] animate-float"
          style={{
            background: "radial-gradient(circle, oklch(0.7 0.2 330 / 0.6), transparent 70%)",
            animationDelay: "2.5s",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        {!logo && (
          <Link to="/" className="flex items-center justify-center gap-2 mb-7">
            <div className="w-9 h-9 rounded-xl bg-iridescent flex items-center justify-center shadow-glow-sm">
              <Sparkles className="w-4 h-4 text-background" />
            </div>
            <span className="font-display font-semibold tracking-tight text-lg">CABANA</span>
          </Link>
        )}

        <div className="glass-strong rounded-3xl p-8 shadow-luxury">
          {logo && (
            <img
              src={cabanaLogo}
              alt="CABANA"
              className="mx-auto mb-7 h-20 w-auto drop-shadow-[0_0_24px_rgba(165,180,252,0.35)]"
            />
          )}
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {eyebrow}
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-iridescent">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-7">{children}</div>
        </div>

        {footer && <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div>}
      </motion.div>
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        {...props}
        className="mt-2 w-full rounded-xl bg-input/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40 transition-colors"
      />
    </label>
  );
}
