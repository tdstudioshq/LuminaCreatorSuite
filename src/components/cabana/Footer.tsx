import { Link } from "@tanstack/react-router";
import logo from "@/assets/cabana-logo.png";
import { comingSoon } from "@/lib/coming-soon";

type FooterLink = { label: string; to?: string };

const FOOTER_GROUPS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Platform", to: "/" },
      { label: "Showcase", to: "/" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "About" }, { label: "Press" }, { label: "Careers" }],
  },
  {
    title: "Legal",
    links: [{ label: "Privacy" }, { label: "Terms" }, { label: "Contact" }],
  },
];

export function Footer() {
  return (
    <footer className="relative px-4 sm:px-6 pb-10 pt-20">
      <div className="max-w-6xl mx-auto glass rounded-3xl p-6 sm:p-10 md:p-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
          <div className="max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <img src={logo} alt="CABANA" width={32} height={32} className="h-8 w-8" />
              <span className="font-display text-lg font-semibold">CABANA</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The luxury operating system for the next generation of creators. Built in private.
              Released by invitation.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-10 text-sm">
            {FOOTER_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  {g.title}
                </p>
                <ul className="space-y-2">
                  {g.links.map((link) => (
                    <li key={link.label}>
                      {link.to ? (
                        <Link
                          to={link.to}
                          className="hover:text-foreground transition-colors text-muted-foreground"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => comingSoon(link.label)}
                          className="hover:text-foreground transition-colors text-muted-foreground"
                        >
                          {link.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-border/50 flex flex-col sm:flex-row justify-between gap-3 text-xs text-muted-foreground">
          <p>© 2026 CABANA. All rights reserved.</p>
          <p>Crafted with obsession.</p>
        </div>
      </div>
    </footer>
  );
}
