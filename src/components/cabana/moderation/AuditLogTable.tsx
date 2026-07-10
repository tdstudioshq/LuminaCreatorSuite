import { Loader2, ScrollText } from "lucide-react";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type AuditLogItem, auditActionLabel } from "@/lib/cabana-moderation";
import { useAuditLogs } from "@/lib/use-moderation";

// The server action fetches at most this many audit entries (its query limit).
const AUDIT_FETCH_LIMIT = 200;

function actorLabel(entry: AuditLogItem): string {
  const who = entry.actorUserId ? entry.actorUserId.slice(0, 8) : "system";
  return `${who} · ${entry.actorRole}`;
}

/**
 * Read-only audit trail (staff-only via RLS). Append-only at the DB layer; this
 * view never mutates. Newest first.
 */
export function AuditLogTable() {
  const { data: logs, isLoading, isError, error, refetch } = useAuditLogs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return (
      <QueryErrorState
        title="Couldn’t load the audit log"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }
  if (!logs || logs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border glass py-16 text-center">
        <ScrollText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No audit activity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.length >= AUDIT_FETCH_LIMIT && (
        <p className="text-[11px] text-muted-foreground/70">
          Showing the most recent {logs.length} audit entries — older entries are not included in
          this view.
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-border glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {auditActionLabel(entry.action)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {entry.targetType}
                  {entry.targetId ? ` · ${entry.targetId.slice(0, 8)}` : ""}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{actorLabel(entry)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
