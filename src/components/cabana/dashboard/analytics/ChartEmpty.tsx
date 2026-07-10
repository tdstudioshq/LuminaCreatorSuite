/**
 * Shared empty-chart state (Batch 2 audit): instead of drawing recharts axes
 * scaled to an invented ceiling for an all-zero/empty series, fill the chart's
 * box with the one canonical "No data in this range yet." message. Sized by the
 * caller via className so it occupies the same footprint the chart would.
 */
export function ChartEmpty({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl border border-dashed border-border/50 bg-foreground/[0.015] ${className}`}
    >
      <p className="text-[11px] text-muted-foreground">No data in this range yet.</p>
    </div>
  );
}
