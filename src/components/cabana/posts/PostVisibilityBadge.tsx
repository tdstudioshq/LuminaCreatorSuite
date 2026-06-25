import { Crown, Globe, Lock, Users } from "lucide-react";
import type { PostVisibility } from "@/lib/cabana-posts";

const META: Record<PostVisibility, { label: string; icon: typeof Globe; className: string }> = {
  public: { label: "Public", icon: Globe, className: "text-foreground/70" },
  followers: { label: "Followers", icon: Users, className: "text-sky-300/90" },
  subscribers: { label: "Subscribers", icon: Crown, className: "text-iridescent" },
  purchase: { label: "Paid unlock", icon: Lock, className: "text-amber-300/90" },
};

export function PostVisibilityBadge({ visibility }: { visibility: PostVisibility }) {
  const meta = META[visibility];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
