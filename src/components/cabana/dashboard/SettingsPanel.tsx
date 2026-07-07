import { Globe, CreditCard, Plug, Check } from "lucide-react";
import { SOCIAL_ICONS } from "@/components/social/social-icons";
import { comingSoon } from "@/lib/coming-soon";
import { Button } from "@/components/ui/button";

const integrations = [
  { name: "Stripe", desc: "Accept payments worldwide", icon: CreditCard, connected: true },
  { name: "Mailchimp", desc: "Sync newsletter audience", icon: Plug, connected: false },
  { name: "Shopify", desc: "Import storefront", icon: Plug, connected: false },
  { name: "Calendly", desc: "Booking integration", icon: Plug, connected: true },
];

const socials = [
  { name: "Instagram", handle: "@aurora", icon: SOCIAL_ICONS.instagram, connected: true },
  { name: "YouTube", handle: "/aurora", icon: SOCIAL_ICONS.youtube, connected: true },
  { name: "Spotify", handle: "Aurora", icon: SOCIAL_ICONS.spotify, connected: false },
  { name: "Telegram", handle: "t.me/aurora", icon: SOCIAL_ICONS.telegram, connected: true },
];

export function SettingsPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tighter">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Domain, payments, integrations and accounts.
        </p>
      </div>

      <div className="glass rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Globe className="w-5 h-5 text-iridescent" />
          <h3 className="font-display text-lg font-semibold">Custom Domain</h3>
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <input
            defaultValue="aurora.cabana.co"
            className="bg-foreground/5 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
          />
          <Button onClick={() => comingSoon("Custom domain verification")} variant="cta">
            Verify
          </Button>
        </div>
        <div className="text-xs text-emerald-300 mt-3 flex items-center gap-1.5">
          <Check className="w-3 h-3" /> SSL active • CDN enabled
        </div>
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
                    <div className="text-xs text-muted-foreground truncate">{i.desc}</div>
                  </div>
                  <button
                    onClick={() => comingSoon(`${i.name} integration`)}
                    className={`text-xs px-3 py-1.5 rounded-full ${i.connected ? "bg-emerald-400/15 text-emerald-300" : "bg-iridescent text-background"}`}
                  >
                    {i.connected ? "Connected" : "Connect"}
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
                    <div className="text-xs text-muted-foreground truncate">{s.handle}</div>
                  </div>
                  <button
                    onClick={() => comingSoon(`${s.name} account linking`)}
                    className={`text-xs px-3 py-1.5 rounded-full ${s.connected ? "bg-emerald-400/15 text-emerald-300" : "bg-iridescent text-background"}`}
                  >
                    {s.connected ? "Linked" : "Link"}
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
