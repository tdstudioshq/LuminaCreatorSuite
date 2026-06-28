import { createFileRoute } from "@tanstack/react-router";
import { GlobalNav } from "@/components/cabana/GlobalNav";
import { Hero } from "@/components/cabana/Hero";

import { Features } from "@/components/cabana/Features";
import { BrandShowcase } from "@/components/cabana/BrandShowcase";
import { CreatorShowcase } from "@/components/cabana/CreatorShowcase";
import { Analytics } from "@/components/cabana/Analytics";
import { Pricing } from "@/components/cabana/Pricing";
import { FinalCTA } from "@/components/cabana/FinalCTA";
import { Footer } from "@/components/cabana/Footer";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "CABANA" },
      {
        name: "description",
        content:
          "Bio pages, storefronts, media kits, fan funnels, AI generation and analytics — engineered into one cinematic, mobile-first hub for premium creators.",
      },
      { property: "og:title", content: "CABANA" },
      {
        property: "og:description",
        content: "More than a link in bio. The luxury operating system for modern creators.",
      },
    ],
  }),
});

function Index() {
  return (
    <div className="relative overflow-x-hidden">
      <GlobalNav />
      <main>
        <Hero />

        <Features />
        <CreatorShowcase />
        <Analytics />
        <BrandShowcase />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
