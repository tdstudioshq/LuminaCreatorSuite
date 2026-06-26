// ============================================================================
// CABANA — reusable report trigger button (Phase 8B)
// ----------------------------------------------------------------------------
// Drop-in "Report" control for any reportable surface (post, comment, creator
// profile, member profile, direct message). Opens <ReportDialog>, which files
// the report through the existing moderation backend under the caller's RLS.
//
// Reporting requires an account (the `reports` INSERT policy is `authenticated`
// + reporter = self), so for signed-out viewers the control renders nothing
// rather than presenting a flow that would fail server-side. Callers that know
// ownership should also hide it for the viewer's own content.
// ============================================================================
import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthSession } from "@/lib/cabana-auth";
import { type ReportSubjectType, reportSubjectLabel } from "@/lib/cabana-moderation";
import { ReportDialog } from "./ReportDialog";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type ButtonSize = React.ComponentProps<typeof Button>["size"];

export function ReportButton({
  subjectType,
  subjectId,
  subjectLabel,
  label = "Report",
  iconOnly = false,
  variant = "ghost",
  size = "sm",
  className,
}: {
  subjectType: ReportSubjectType;
  subjectId: string;
  /** Optional human label for the thing being reported (defaults to the subject type). */
  subjectLabel?: string;
  /** Visible button text (ignored when `iconOnly`). */
  label?: string;
  /** Render the flag icon only (with an accessible label). */
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { user } = useAuthSession();
  const [open, setOpen] = useState(false);

  // Reporting needs an authenticated reporter; hide for guests.
  if (!user) return null;

  const accessibleLabel = `Report ${(subjectLabel ?? reportSubjectLabel(subjectType)).toLowerCase()}`;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? "icon" : size}
        className={cn("text-muted-foreground hover:text-foreground", className)}
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? accessibleLabel : undefined}
        title={accessibleLabel}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        {iconOnly ? null : label}
      </Button>
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        subjectType={subjectType}
        subjectId={subjectId}
        subjectLabel={subjectLabel}
      />
    </>
  );
}
