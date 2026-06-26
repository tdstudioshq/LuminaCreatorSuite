import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { MESSAGE_BODY_MAX } from "@/lib/cabana-messaging";
import { useSendMessage } from "@/lib/use-messaging";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("");
  const send = useSendMessage(conversationId);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await send.mutateAsync(trimmed);
      setBody("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t send your message.");
    }
  }

  return (
    <div className="glass flex items-end gap-2 rounded-2xl p-2">
      <textarea
        value={body}
        maxLength={MESSAGE_BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message…"
        rows={1}
        className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-xl bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-white/20"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        onClick={() => void submit()}
        disabled={send.isPending || body.trim().length === 0}
        className="btn-luxury !px-3 !py-2 text-xs disabled:opacity-50"
        aria-label="Send message"
      >
        {send.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
