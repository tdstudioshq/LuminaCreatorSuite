import { toast } from "sonner";

/**
 * Standard "not active yet" feedback for controls whose backend does not exist
 * in this phase. Keeps placeholder buttons honest instead of silently dead.
 */
export function comingSoon(feature: string) {
  toast(`${feature} is coming soon`, {
    description: "This part of CABANA isn't active yet.",
  });
}
