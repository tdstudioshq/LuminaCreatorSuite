/**
 * The single unread-count badge used across all nav surfaces (sidebar desktop,
 * mobile tabs, social nav). Identical sizing / positioning-hook / spacing /
 * typography everywhere — position is supplied by the caller via className.
 * Renders nothing at zero.
 */
export function UnreadBadge({
  count,
  label,
  className = "",
}: {
  count: number;
  label: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full bg-iridescent px-1.5 text-[10px] font-semibold leading-[18px] text-background ${className}`}
      aria-label={label}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
