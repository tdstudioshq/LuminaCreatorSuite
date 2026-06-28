import { motion } from "framer-motion";
import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles, Menu, X, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { useCabanaUser } from "@/lib/cabana-auth";

const LINKS = [
  { to: "/", label: "Platform" },
  { to: "/discover", label: "Discover" },
  { to: "/pricing", label: "Pricing" },
  { to: "/onboarding", label: "Onboarding" },
] as const;

export function GlobalNav() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = useCabanaUser();

  return (
    <>
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(96%,1100px)]"
      >
        <div className="glass-strong rounded-2xl px-3 sm:px-5 py-2.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 pl-1">
            <div className="w-8 h-8 rounded-xl bg-iridescent flex items-center justify-center shadow-glow-sm">
              <Sparkles className="w-4 h-4 text-background" />
            </div>
            <span className="font-display font-semibold tracking-tight">CABANA</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {LINKS.map((l) => {
              const active = l.to === "/" ? path === "/" : path.startsWith(l.to);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className="relative px-3.5 py-1.5 rounded-full text-xs font-medium"
                >
                  {active && (
                    <motion.span
                      layoutId="globalnav-pill"
                      className="absolute inset-0 rounded-full bg-foreground/8 border border-border/60"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span
                    className={`relative ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground transition-colors"}`}
                  >
                    {l.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden md:flex items-center gap-1.5 sm:gap-2">
              {user ? (
                <Link to="/dashboard" className="btn-ghost !px-3.5 !py-2 text-xs">
                  Studio
                </Link>
              ) : (
                <>
                  <Link to="/login" className="btn-ghost !px-3.5 !py-2 text-xs">
                    Sign in
                  </Link>
                  <Link to="/signup" className="btn-ghost !px-3.5 !py-2 text-xs">
                    Sign up
                  </Link>
                </>
              )}
            </div>
            <Link
              to="/onboarding"
              className="btn-luxury !px-3 sm:!px-4 !py-2 text-xs whitespace-nowrap"
            >
              <span className="sm:hidden">Get in</span>
              <span className="hidden sm:inline">Get access</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="md:hidden w-9 h-9 rounded-xl glass flex items-center justify-center shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile sheet */}
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] md:hidden"
        >
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-2xl"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative m-4 glass-strong rounded-3xl p-5 shadow-luxury"
          >
            <div className="flex items-center justify-between mb-5">
              <span className="font-display font-semibold">Menu</span>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full glass flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col">
              {[
                ...LINKS,
                { to: "/dashboard", label: "Studio" },
                { to: "/admin", label: "Admin" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="px-2 py-3 border-b border-border/40 last:border-0 flex items-center justify-between"
                >
                  <span className="font-medium">{l.label}</span>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
            {user ? (
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="btn-luxury w-full mt-5 justify-center"
              >
                Open Studio
              </Link>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="btn-ghost w-full justify-center !py-3 text-xs"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setOpen(false)}
                  className="btn-luxury w-full justify-center !py-3 text-xs"
                >
                  Sign up
                </Link>
              </div>
            )}
            <Link
              to="/onboarding"
              onClick={() => setOpen(false)}
              className="btn-ghost w-full mt-2 justify-center !py-3 text-xs"
            >
              Get access
            </Link>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
