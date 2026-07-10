import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import cabanaLogo from "@/assets/cabana-logo.png";

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
      className="flex min-h-screen items-center justify-center px-4 py-16"
      style={{
        backgroundImage: "url('/td-studios-black-marble.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="absolute inset-0 -z-10 rounded-[32px] bg-black/40 blur-3xl" />
        <div className="relative overflow-hidden rounded-[32px] border-2 border-white/20 bg-black/30 px-8 py-10 shadow-[0_0_45px_rgba(0,0,0,0.65)] backdrop-blur-lg">
          <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/10" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-40 rounded-b-full bg-white/15 opacity-60 blur-3xl" />
          <div className="relative">
            <img
              src={cabanaLogo}
              alt="CABANA"
              className="mx-auto mb-6 h-24 w-24 object-contain drop-shadow-[0_0_24px_rgba(165,180,252,0.35)]"
            />
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">{eyebrow}</div>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-iridescent">
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
