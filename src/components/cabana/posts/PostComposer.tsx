import { useRef, useState } from "react";
import { Globe, ImagePlus, Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { PostVisibility } from "@/lib/cabana-posts";
import { CAPTION_MAX, IMAGE_MIME_ALLOWLIST, MEDIA_PER_POST_MAX } from "@/lib/cabana-posts";
import { useCreatePost, usePublishPost, useUploadPostMedia } from "@/lib/use-posts";

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: typeof Globe }[] = [
  { value: "public", label: "Public", icon: Globe },
  { value: "followers", label: "Followers", icon: Users },
];

export function PostComposer() {
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const createPost = useCreatePost();
  const uploadMedia = useUploadPostMedia();
  const publishPost = usePublishPost();
  const busy = createPost.isPending || uploadMedia.isPending || publishPost.isPending;

  const canSubmit = (caption.trim().length > 0 || files.length > 0) && !busy;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => IMAGE_MIME_ALLOWLIST.includes(f.type));
    if (incoming.length < (list.length ?? 0)) {
      toast.error("Only JPEG, PNG, WebP, GIF, or AVIF images are supported.");
    }
    setFiles((prev) => [...prev, ...incoming].slice(0, MEDIA_PER_POST_MAX));
  }

  function reset() {
    setCaption("");
    setVisibility("public");
    setFiles([]);
  }

  async function submit(publish: boolean) {
    try {
      const post = await createPost.mutateAsync({ caption: caption.trim(), visibility });
      for (let i = 0; i < files.length; i++) {
        await uploadMedia.mutateAsync({ postId: post.id, file: files[i], position: i });
      }
      if (publish) await publishPost.mutateAsync(post.id);
      reset();
      toast.success(publish ? "Post published." : "Draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t save the post.");
    }
  }

  return (
    <div className="glass-strong flex flex-col gap-4 rounded-3xl p-6">
      <textarea
        value={caption}
        maxLength={CAPTION_MAX}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Share an update with your audience…"
        rows={3}
        className="w-full resize-none rounded-2xl bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-white/20"
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative h-16 w-16 overflow-hidden rounded-xl">
              <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_MIME_ALLOWLIST.join(",")}
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={files.length >= MEDIA_PER_POST_MAX}
          className="btn-ghost !px-3 !py-2 text-xs disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" /> Image
        </button>

        <div className="ml-auto flex items-center gap-1 rounded-full bg-white/5 p-1">
          {VISIBILITY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = visibility === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setVisibility(opt.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
                  active ? "bg-white/10 text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => void submit(false)}
          disabled={!canSubmit}
          className="btn-ghost !px-4 !py-2.5 text-xs disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          onClick={() => void submit(true)}
          disabled={!canSubmit}
          className="btn-luxury !px-5 !py-2.5 text-xs disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publish
        </button>
      </div>
    </div>
  );
}
