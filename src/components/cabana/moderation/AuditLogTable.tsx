import { Loader2, ScrollText } from "lucide-react";
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

function actorLabel(entry: AuditLogItem): string {
  const who = entry.actorUserId ? entry.actorUserId.slice(0, 8) : "system";
  return `${who} · ${entry.actorRole}`;
}

/**
 * Read-only audit trail (staff-only via RLS). Append-only at the DB layer; this
 * view never mutates. Newest first.
 */
export function AuditLogTable() {
  const { data: logs, isLoading, isError, error } = useAuditLogs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (isError) {
    return (
      <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load the audit log."}
      </p>
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
  );
}
