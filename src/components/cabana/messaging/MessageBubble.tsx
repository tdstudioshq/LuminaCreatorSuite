import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { ReportButton } from "@/components/cabana/reporting/ReportButton";
import type { Message } from "@/lib/cabana-messaging";
import { canDeleteMessage } from "@/lib/cabana-messaging";

export function MessageBubble({
  message,
  onDelete,
}: {
  message: Message;
  onDelete?: (id: string) => void;
}) {
  const mine = message.mine;
  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[78%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm ${
            mine ? "bg-iridescent text-background" : "glass"
          } ${message.isDeleted ? "italic opacity-60" : ""}`}
        >
          <p className="whitespace-pre-wrap break-words">
            {message.isDeleted ? "Message deleted" : message.body}
          </p>
        </div>
        <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground/70">
          <time>{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</time>
          {message.editedAt && !message.isDeleted && <span>· edited</span>}
          {mine && onDelete && canDeleteMessage(message) && (
            <button
              onClick={() => onDelete(message.id)}
              className="opacity-0 transition-opacity hover:text-red-300/80 group-hover:opacity-100"
              aria-label="Delete message"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          {!mine && !message.isDeleted && (
            <ReportButton
              subjectType="message"
              subjectId={message.id}
              subjectLabel="message"
              iconOnly
              className="h-auto w-auto p-0 opacity-0 transition-opacity hover:bg-transparent hover:text-amber-300/80 group-hover:opacity-100"
            />
          )}
        </div>
      </div>
    </div>
  );
}
