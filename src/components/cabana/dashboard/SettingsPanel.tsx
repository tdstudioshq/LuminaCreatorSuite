import { Globe, CreditCard, Plug } from "lucide-react";
import { SOCIAL_ICONS } from "@/components/social/social-icons";
import { comingSoon } from "@/lib/coming-soon";
import { useCabana } from "@/lib/cabana-store";
import { Button } from "@/components/ui/button";

const integrations = [
  {
    name: "Stripe",
    desc: "Accept payments worldwide",
    icon: CreditCard,
    status: "After payments launch",
  },
  { name: "Mailchimp", desc: "Sync newsletter audience", icon: Plug, status: "Coming soon" },
  { name: "Shopify", desc: "Import storefront", icon: Plug, status: "Coming soon" },
  { name: "Calendly", desc: "Booking integration", icon: Plug, status: "Coming soon" },
];

const socials = [
  { name: "Instagram", icon: SOCIAL_ICONS.instagram },
  { name: "YouTube", icon: SOCIAL_ICONS.youtube },
  { name: "Spotify", icon: SOCIAL_ICONS.spotify },
  { name: "Telegram", icon: SOCIAL_ICONS.telegram },
];

export function SettingsPanel() {
  const { profile } = useCabana();
  const handle = profile?.handle;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tighter">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Domain, integrations and connected accounts.
        </p>
      </div>

      <div className="glass rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Globe className="w-5 h-5 text-iridescent" />
          <h3 className="font-display text-lg font-semibold">Custom Domain</h3>
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <input
            key={handle ?? "no-handle"}
            defaultValue={handle ? `${handle}.cabana.co` : undefined}
            placeholder="yourname.cabana.co"
            className="bg-foreground/5 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
          />
          <Button onClick={() => comingSoon("Custom domain verification")} variant="cta">
            Verify
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Custom domains are coming soon — verification is not yet available.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-3xl p-6">
          <h3 className="font-display text-lg font-semibold mb-4">Integrations</h3>
          <div className="space-y-2">
            {integrations.map((i) => {
              const Icon = i.icon;
              return (
                <div
                  key={i.name}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-foreground/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl glass-strong flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.desc}</div>
                  </div>
                  <button
                    onClick={() => comingSoon(`${i.name} integration`)}
                    className="shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-full border border-border bg-foreground/[0.05] text-muted-foreground"
                  >
                    {i.status}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <h3 className="font-display text-lg font-semibold mb-4">Social Accounts</h3>
          <div className="space-y-2">
            {socials.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.name}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-foreground/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl glass-strong flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">Not linked</div>
                  </div>
                  <button
                    onClick={() => comingSoon(`${s.name} account linking`)}
                    className="shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-full border border-border bg-foreground/[0.05] text-muted-foreground"
                  >
                    Coming soon
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
