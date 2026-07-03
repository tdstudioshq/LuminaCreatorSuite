import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

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
    <div className="grid min-h-[100svh] bg-white text-[#11131a] md:grid-cols-2">
      <aside className="relative hidden min-h-[100svh] overflow-hidden bg-[#070811] px-[46px] py-[45px] text-white md:flex md:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_77%_18%,rgba(129,75,158,0.38),transparent_40%),radial-gradient(circle_at_95%_93%,rgba(0,190,178,0.3),transparent_36%),radial-gradient(circle_at_20%_88%,rgba(151,42,128,0.18),transparent_38%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,13,0.96),rgba(17,10,25,0.62))]" />

        <Link to="/" className="relative z-10 flex items-center gap-[11px]">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#79d8ed_0%,#df66d5_56%,#f3a2ab_100%)] shadow-[0_0_18px_rgba(229,102,213,0.28)]">
            <Sparkles className="h-[18px] w-[18px] text-[#171324]" strokeWidth={2.4} />
          </span>
          <span className="text-[22px] font-extrabold leading-none tracking-[0]">CABANA</span>
        </Link>

        <div className="relative z-10 mt-[184px] max-w-[590px]">
          <h1 className="font-sans text-[54px] font-extrabold leading-[1.05] tracking-[0] text-white xl:text-[56px]">
            The operating system
            <br />
            for{" "}
            <span className="bg-[linear-gradient(100deg,#5bddec_0%,#8177df_48%,#e66bd2_100%)] bg-clip-text font-medium italic text-transparent">
              modern
            </span>{" "}
            <span className="bg-[linear-gradient(100deg,#db67e2_0%,#f38d8a_100%)] bg-clip-text font-medium italic text-transparent">
              creators.
            </span>
          </h1>
          <p className="mt-[26px] max-w-[590px] text-[20px] font-semibold leading-[1.35] tracking-[0] text-white/58">
            Landing pages, storefronts, media kits and fan funnels —
            <br />
            engineered into one cinematic, mobile-first hub. No
            <br />
            templates. No compromises.
          </p>
        </div>

        <p className="relative z-10 mt-auto text-[14px] font-bold leading-none tracking-[0] text-white/54">
          © 2026 Cabana Creator Suite • demo environment
        </p>
      </aside>

      <main className="flex min-h-[100svh] items-start justify-center bg-white px-6 text-[#11131a] [--border:#e8e9ee] [--foreground:#11131a] [--input:#edf4ff] [--muted-foreground:#8b8d96] [--primary:#2ca9af] [--ring:rgba(102,215,230,0.5)] sm:px-10">
        <section className="w-full max-w-[360px] pt-[91px]">
          {eyebrow && (
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#9b9ba3]">
              {eyebrow}
            </p>
          )}
          <h1 className="font-sans text-[25px] font-extrabold leading-[1.18] tracking-[0] text-[#11131a]">
            {title}
          </h1>
          <p className="mt-[5px] text-[13px] font-medium leading-5 tracking-[0] text-[#8b8d96]">
            {subtitle}
          </p>

          <div className="mt-[24px]">{children}</div>

          {footer && <div className="mt-6 text-center text-xs text-[#8b8d96]">{footer}</div>}
        </section>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold leading-none tracking-[0] text-[#4f515b]">
        {label}
      </span>
      <input
        {...props}
        className="mt-[9px] h-[40px] w-full rounded-[9px] border border-[#e3eafa] bg-[#edf4ff] px-[14px] text-[12px] font-semibold tracking-[0] text-[#181a23] shadow-[inset_0_1px_2px_rgba(16,24,40,0.03)] transition-colors placeholder:text-[#8b8d96] focus:border-[#66d7e6] focus:outline-none focus:ring-4 focus:ring-[#66d7e6]/20"
      />
    </label>
  );
}
