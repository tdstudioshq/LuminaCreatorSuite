import {
  Bell,
  BadgeDollarSign,
  Bookmark,
  Crown,
  Heart,
  MessageSquare,
  ShoppingBag,
  UserPlus,
  WalletCards,
} from "lucide-react";
import type { NotificationType } from "@/lib/cabana-notifications";

const ICONS: Record<NotificationType, { icon: typeof Bell; className: string }> = {
  new_follower: { icon: UserPlus, className: "text-sky-300/90" },
  post_liked: { icon: Heart, className: "text-rose-300/90" },
  post_commented: { icon: MessageSquare, className: "text-violet-300/90" },
  post_saved: { icon: Bookmark, className: "text-amber-300/90" },
  new_subscriber: { icon: Crown, className: "text-iridescent" },
  tip_received: { icon: BadgeDollarSign, className: "text-emerald-300/90" },
  purchase_made: { icon: ShoppingBag, className: "text-emerald-300/90" },
  message_received: { icon: MessageSquare, className: "text-sky-300/90" },
  payout_requested: { icon: WalletCards, className: "text-amber-300/90" },
  system: { icon: Bell, className: "text-muted-foreground" },
};

export function NotificationIcon({ type }: { type: NotificationType }) {
  const { icon: Icon, className } = ICONS[type] ?? ICONS.system;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5">
      <Icon className={`h-4 w-4 ${className}`} />
    </span>
  );
}
