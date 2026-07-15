import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Globe, ImagePlus, Loader2, Lock, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { VideoUploadCard } from "@/components/cabana/posts/VideoUploadCard";
import {
  type UnloadGuardTarget,
  VIDEO_ACCEPT_ATTRIBUTE,
  bindBeforeUnloadGuard,
  canAddImages,
  canSelectVideo,
  composerHasContent,
  evaluateComposerDraft,
  evaluateComposerPublish,
  shouldWarnBeforeUnload,
} from "@/lib/cabana-composer-media";
import type { PostVisibility } from "@/lib/cabana-posts";
import { CAPTION_MAX, IMAGE_MIME_ALLOWLIST, MEDIA_PER_POST_MAX } from "@/lib/cabana-posts";
import { dollarsToCents } from "@/lib/cabana-money";
import {
  type UploadPreflightRejectionReason,
  preflightUploadFile,
} from "@/lib/cabana-stream-upload";
import { useStreamUpload } from "@/lib/use-stream-upload";
import { useCreatePost, usePublishPost, useUpdatePost, useUploadPostMedia } from "@/lib/use-posts";
import { useMyTiers } from "@/lib/use-subscriptions";

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: typeof Globe }[] = [
  { value: "public", label: "Public", icon: Globe },
  { value: "followers", label: "Followers", icon: Users },
  { value: "subscribers", label: "Subscribers", icon: Crown },
  { value: "purchase", label: "Paid unlock", icon: Lock },
];

export function PostComposer() {
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [price, setPrice] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── Video (Checkpoint 5A.3) ────────────────────────────────────────────────
  // A video needs a post row BEFORE its upload ticket, so the composer creates
  // the post as a DRAFT on first video selection and reuses that same row for
  // every later save/publish — never a parallel record.
  const [videoMode, setVideoMode] = useState(false);
  const [draftPostId, setDraftPostId] = useState<string | null>(null);
  const [rejection, setRejection] = useState<{ reason: UploadPreflightRejectionReason } | null>(
    null,
  );
  const videoInput = useRef<HTMLInputElement>(null);
  const upload = useStreamUpload();
  const [detaching, setDetaching] = useState(false);

  /**
   * Remove an attached video (5A.4). The controller only clears the session when
   * the server confirms the detach, so a failure leaves the card exactly as it
   * was — still showing the video that is still on the post.
   */
  const handleDetach = async () => {
    if (detaching) return;
    setDetaching(true);
    try {
      const removed = await upload.removeAttached();
      if (removed) {
        setVideoMode(false);
        setRejection(null);
      } else {
        toast.error("Couldn’t remove the video. It’s still attached to this post.");
      }
    } finally {
      setDetaching(false);
    }
  };

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const uploadMedia = useUploadPostMedia();
  const publishPost = usePublishPost();
  const busy =
    createPost.isPending || updatePost.isPending || uploadMedia.isPending || publishPost.isPending;

  const isPurchase = visibility === "purchase";
  const parsedPrice = Number.parseFloat(price);
  const priceCents =
    isPurchase && Number.isFinite(parsedPrice) ? dollarsToCents(parsedPrice) : null;
  const priceValid = !isPurchase || (priceCents !== null && priceCents > 0);

  // Subscribers-only posts are unlockable only through an active tier; without
  // one the content would be permanently inaccessible to everyone but the
  // creator, so publishing is blocked (drafts stay allowed).
  const myTiers = useMyTiers();
  const hasActiveTier = (myTiers.data ?? []).some((t) => t.isActive);
  const subscribersUnsellable = visibility === "subscribers" && myTiers.isSuccess && !hasActiveTier;

  const mediaState = { imageCount: files.length, session: upload.session };
  const imageDecision = canAddImages(mediaState);
  const videoDecision = canSelectVideo(mediaState);

  const gateInput = {
    captionLength: caption.trim().length,
    imageCount: files.length,
    session: upload.session,
    priceValid,
    subscribersUnsellable,
    busy,
  };
  const draftGate = evaluateComposerDraft(gateInput);
  const publishGate = evaluateComposerPublish(gateInput);
  const hasContent = composerHasContent(gateInput);

  // The upload dies with the tab and a partial Cloudflare asset would be
  // stranded, so warn while bytes or cleanup debt are outstanding. Bound once;
  // the predicate reads the live session through a ref. (Processing is NOT
  // warned — encoding continues server-side and the webhook records it.)
  const sessionRef = useRef(upload.session);
  sessionRef.current = upload.session;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const target: UnloadGuardTarget = {
      addEventListener: (type, listener) =>
        window.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) =>
        window.removeEventListener(type, listener as EventListener),
    };
    return bindBeforeUnloadGuard(target, () => shouldWarnBeforeUnload(sessionRef.current));
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => IMAGE_MIME_ALLOWLIST.includes(f.type));
    if (incoming.length < (list.length ?? 0)) {
      toast.error("Only JPEG, PNG, WebP, GIF, or AVIF images are supported.");
    }
    setFiles((prev) => [...prev, ...incoming].slice(0, MEDIA_PER_POST_MAX));
  }

  /** The post row a video attaches to — created once, then reused. */
  async function ensureDraftPost(): Promise<string> {
    if (draftPostId !== null) return draftPostId;
    const post = await createPost.mutateAsync({
      caption: caption.trim(),
      visibility,
      priceCents: isPurchase ? priceCents : null,
    });
    setDraftPostId(post.id);
    return post.id;
  }

  async function onVideoPicked(file: File | undefined) {
    if (!file) return;
    setRejection(null);
    // Preflight BEFORE the draft post exists, so a rejected file never leaves an
    // orphan row behind. `beginUpload` re-checks with the same pure rules.
    const preflight = preflightUploadFile({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!preflight.ok) {
      setRejection({ reason: preflight.reason });
      return;
    }
    try {
      const postId = await ensureDraftPost();
      const result = upload.beginUpload(file, postId);
      if (!result.ok && result.reason !== "not_idle") {
        setRejection({ reason: result.reason });
      }
    } catch {
      // Never surface a raw server-action message on the video path.
      toast.error("Couldn’t start the video upload. Try again.");
    }
  }

  function reset() {
    setCaption("");
    setVisibility("public");
    setPrice("");
    setFiles([]);
    setVideoMode(false);
    setDraftPostId(null);
    setRejection(null);
    upload.reset();
  }

  async function submit(publish: boolean) {
    try {
      // Reuse the draft the video created; otherwise create the post now.
      let postId = draftPostId;
      if (postId === null) {
        const post = await createPost.mutateAsync({
          caption: caption.trim(),
          visibility,
          priceCents: isPurchase ? priceCents : null,
        });
        postId = post.id;
        setDraftPostId(post.id);
      } else {
        await updatePost.mutateAsync({
          postId,
          caption: caption.trim(),
          visibility,
          priceCents: isPurchase ? priceCents : null,
        });
      }
      for (let i = 0; i < files.length; i++) {
        await uploadMedia.mutateAsync({ postId, file: files[i], position: i });
      }
      if (publish) await publishPost.mutateAsync(postId);

      // A draft saved mid-upload must KEEP the composer (and its draft id) —
      // clearing it would orphan the in-flight upload's target post.
      const settled = upload.session.phase === "idle" || upload.session.phase === "ready";
      if (settled) reset();
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

      {(videoMode || upload.session.phase !== "idle") && (
        <VideoUploadCard
          session={upload.session}
          rejection={rejection ?? upload.preflightRejection}
          onChooseFile={() => videoInput.current?.click()}
          onPause={() => upload.pause()}
          onResume={() => upload.resume()}
          onRetry={() => upload.retry()}
          onCancel={() => upload.cancel()}
          onRemove={() => {
            upload.reset();
            setVideoMode(false);
            setRejection(null);
          }}
          onDetach={() => void handleDetach()}
          detaching={detaching}
          onDismiss={() => {
            setVideoMode(false);
            setRejection(null);
          }}
        />
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
        <input
          ref={videoInput}
          type="file"
          accept={VIDEO_ACCEPT_ATTRIBUTE}
          hidden
          onChange={(e) => {
            void onVideoPicked(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={!imageDecision.allowed}
          title={imageDecision.allowed ? undefined : imageDecision.reason}
          className="btn-ghost min-h-11 !px-3 !py-2 text-xs disabled:opacity-60"
        >
          <ImagePlus className="h-4 w-4" /> Image
        </button>
        <button
          onClick={() => {
            setVideoMode(true);
            videoInput.current?.click();
          }}
          disabled={!videoDecision.allowed}
          title={videoDecision.allowed ? undefined : videoDecision.reason}
          className="btn-ghost min-h-11 !px-3 !py-2 text-xs disabled:opacity-60"
        >
          <Video className="h-4 w-4" /> Video
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-1 rounded-2xl bg-white/5 p-1 sm:rounded-full">
          {VISIBILITY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = visibility === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setVisibility(opt.value)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
                  active ? "bg-white/10 text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {subscribersUnsellable && (
        <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
          Subscribers-only posts need an active subscription tier so fans can unlock them.{" "}
          <Link to="/dashboard/subscribers" className="font-semibold underline underline-offset-2">
            Create a tier
          </Link>{" "}
          first — you can still save this as a draft.
        </p>
      )}

      {isPurchase && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Unlock price (USD)</span>
            <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]">
              Demo
            </span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="9.99"
            className="w-40 rounded-xl bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-white/20"
          />
          <p className="text-[11px] text-muted-foreground">
            Buyers pay a one-time price to unlock this post. Demo Mode — no real payment is
            processed.
          </p>
        </div>
      )}

      {!publishGate.allowed && hasContent && !subscribersUnsellable && (
        <p className="text-right text-[11px] text-muted-foreground" data-testid="publish-blocked">
          {publishGate.reason}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => void submit(false)}
          disabled={!draftGate.allowed}
          title={draftGate.allowed ? undefined : draftGate.reason}
          className="btn-ghost min-h-11 !px-4 !py-2.5 text-xs disabled:opacity-60"
        >
          Save draft
        </button>
        <button
          onClick={() => void submit(true)}
          disabled={!publishGate.allowed}
          title={publishGate.allowed ? undefined : publishGate.reason}
          className="btn-luxury min-h-11 !px-5 !py-2.5 text-xs disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publish
        </button>
      </div>
    </div>
  );
}
