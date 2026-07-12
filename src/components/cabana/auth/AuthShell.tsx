import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

/**
 * Shared scaffold for the signup / forgot-password / reset-password surfaces.
 * Matches the sign-in front door (LoginCard) exactly — same black-marble
 * backdrop, the iridescent chrome CABANA logo, and one glass card treatment —
 * so the whole auth funnel reads as a single brand.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,oklch(0.75_0.055_75/0.16),transparent_32%),linear-gradient(135deg,oklch(0.07_0.004_75),oklch(0.115_0.009_75))]" />
      <div className="absolute inset-y-0 left-0 hidden w-[38%] border-r border-white/[0.07] bg-[url('/cabana-og.webp')] bg-cover bg-center opacity-25 grayscale lg:block" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md lg:ml-[34%]"
      >
        <div className="relative overflow-hidden border border-white/[0.1] bg-black/35 px-7 py-9 shadow-[0_40px_100px_-45px_black] backdrop-blur-2xl sm:px-10 sm:py-11">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
          <div className="relative">
            <img
              src="/cabana-logo.png"
              alt="CABANA"
              className="mx-auto mb-7 h-20 w-20 object-contain"
            />
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">{eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl font-medium tracking-[-0.045em] text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm text-white/70">{subtitle}</p>

            <div className="mt-7">{children}</div>
          </div>
        </div>

        {footer && <div className="mt-6 text-center text-xs text-white/60">{footer}</div>}
      </motion.div>
    </main>
  );
}

export function AuthField({
  label,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (reveal ? "text" : "password") : type;
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          {...props}
          type={inputType}
          className={`mt-2 w-full rounded-xl bg-input/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40 transition-colors ${
            isPassword ? "pr-11" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="tap-target absolute right-3 top-1/2 -translate-y-1/2 mt-1 text-muted-foreground transition hover:text-foreground"
            aria-label={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        )}
      </div>
    </label>
  );
}

// Same icons/behavior as the LoginCard password toggle, so the whole funnel matches.
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.57 18.57 0 0 1 5.06-5.94" />
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}
