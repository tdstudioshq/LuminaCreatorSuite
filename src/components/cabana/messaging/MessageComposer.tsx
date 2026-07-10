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
    <div className="flex items-end gap-2 rounded-3xl border border-white/[0.1] bg-white/[0.045] p-2 shadow-[inset_0_1px_0_oklch(1_0_0/0.08),0_18px_55px_-38px_oklch(0_0_0/0.9)] transition-all focus-within:border-primary/35 focus-within:bg-white/[0.06] focus-within:ring-4 focus-within:ring-primary/10">
      <div className="min-w-0 flex-1">
        <textarea
          value={body}
          maxLength={MESSAGE_BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          rows={1}
          className="max-h-32 min-h-[2.75rem] w-full resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground/60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {body.length > MESSAGE_BODY_MAX * 0.9 ? (
          <p className="px-3 pb-1 text-right text-[10px] text-muted-foreground">
            {body.length}/{MESSAGE_BODY_MAX}
          </p>
        ) : null}
      </div>
      <button
        onClick={() => void submit()}
        disabled={send.isPending || body.trim().length === 0}
        className="btn-luxury mb-0.5 h-10 w-10 shrink-0 !rounded-full !p-0 text-xs disabled:translate-y-0 disabled:opacity-60"
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
