import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";
import { AdminCreatorPageAuditPanel } from "@/components/cabana/admin-creators/AdminCreatorPageAuditPanel";
import {
  AdminCreatorPageIdentityForm,
  type AdminCreatorPageEditorDraft,
} from "@/components/cabana/admin-creators/AdminCreatorPageIdentityForm";
import { AdminCreatorPageLifecycle } from "@/components/cabana/admin-creators/AdminCreatorPageLifecycle";
import { AdminCreatorPageLinkManager } from "@/components/cabana/admin-creators/AdminCreatorPageLinkManager";
import { AdminCreatorPageOwnership } from "@/components/cabana/admin-creators/AdminCreatorPageOwnership";
import { AdminCreatorPagePreview } from "@/components/cabana/admin-creators/AdminCreatorPagePreview";
import { ICON_OPTIONS, type CabanaLink, type CabanaProfile } from "@/lib/cabana-creator-page-view";
import type { AdminCreatorPageDetail } from "@/lib/cabana-admin-creator-page-detail";
import {
  useAdminCreatorPageAuditHistory,
  useAdminCreatorPageDetail,
} from "@/lib/use-admin-creator-page";
import { useAdminCreatorPageMutations } from "@/lib/use-admin-creator-page-mutations";

function editorDraft(detail: AdminCreatorPageDetail): AdminCreatorPageEditorDraft {
  return {
    handle: detail.handle,
    name: detail.displayName,
    bio: detail.bio,
    headline: detail.headline,
    avatarUrl: detail.avatarUrl ?? "",
    bannerUrl: detail.bannerUrl ?? "",
    theme: detail.theme,
    accentColor: detail.accentColor,
    buttonStyle: detail.buttonStyle,
    fontFamily: detail.fontFamily,
    backgroundStyle: detail.backgroundStyle,
  };
}

function previewProfile(
  detail: AdminCreatorPageDetail,
  draft: AdminCreatorPageEditorDraft,
): CabanaProfile {
  return {
    id: detail.id,
    handle: draft.handle,
    name: draft.name,
    bio: draft.bio,
    headline: draft.headline,
    avatar: draft.avatarUrl,
    banner: draft.bannerUrl,
    theme: draft.theme,
    accentColor: draft.accentColor,
    buttonStyle: draft.buttonStyle,
    fontFamily: draft.fontFamily,
    backgroundStyle: draft.backgroundStyle,
    pageStatus: detail.pageStatus,
    plan: detail.plan,
  };
}

function previewLinks(detail: AdminCreatorPageDetail): CabanaLink[] {
  return detail.links.map((link) => ({
    id: link.id,
    title: link.title,
    url: link.url,
    icon: ICON_OPTIONS.includes(link.icon as (typeof ICON_OPTIONS)[number])
      ? (link.icon as (typeof ICON_OPTIONS)[number])
      : "globe",
    clicks: 0,
    ctr: "0%",
    scheduled: link.scheduled ?? undefined,
    featured: link.featured,
    position: link.position,
    kind: link.kind,
    isVisible: link.isVisible,
  }));
}

export function AdminCreatorPageEditor({ creatorProfileId }: { creatorProfileId: string }) {
  const detailQuery = useAdminCreatorPageDetail(creatorProfileId);
  const auditQuery = useAdminCreatorPageAuditHistory(creatorProfileId);
  const mutations = useAdminCreatorPageMutations(creatorProfileId);
  const detail = detailQuery.data;
  const initialDraft = useMemo(() => (detail ? editorDraft(detail) : null), [detail]);
  const [editedPreviewDraft, setEditedPreviewDraft] = useState<AdminCreatorPageEditorDraft | null>(
    () => initialDraft,
  );
  // Keep an in-progress identity draft across lifecycle/ownership/link
  // refetches. The route keys this component by page id, so a different page
  // still starts from its own server value.
  const previewDraft = editedPreviewDraft ?? initialDraft;

  if (detailQuery.isPending) {
    return (
      <div className="glass flex min-h-72 items-center justify-center rounded-3xl" aria-busy="true">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading creator page…
        </span>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <QueryErrorState
        title="Couldn’t load this creator page"
        message="The editor does not show placeholder data when its protected read fails."
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  if (!detail || !initialDraft || !previewDraft) {
    return (
      <div className="glass-strong rounded-3xl p-8 text-center">
        <p className="text-sm font-medium">Creator page not found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          It may not exist, or your account may not have access.
        </p>
        <Link
          to="/admin/creators"
          className="btn-ghost mt-5 inline-flex min-h-10 items-center px-4 text-xs"
        >
          Back to creators
        </Link>
      </div>
    );
  }

  const profile = previewProfile(detail, previewDraft);
  const links = previewLinks(detail);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/creators"
          className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to creators
        </Link>
        <p className="font-mono text-[10px] text-muted-foreground">Page {detail.id}</p>
      </div>

      {detail.pageStatus === "archived" ? (
        <p
          className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
          role="status"
        >
          This creator page is archived and hidden publicly. Restore it to draft before publishing.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <AdminCreatorPageLifecycle
          status={detail.pageStatus}
          onAction={(action) => mutations.setStatus.mutateAsync({ action }).then(() => undefined)}
        />
        <AdminCreatorPageOwnership
          claimed={detail.claimed}
          ownerId={detail.ownerUserId}
          onTransfer={(toUserId) =>
            mutations.transfer.mutateAsync({ toUserId }).then(() => undefined)
          }
        />
      </div>

      <AdminCreatorPageIdentityForm
        initialValue={initialDraft}
        onDraftChange={setEditedPreviewDraft}
        onSave={(draft) =>
          mutations.updatePage
            .mutateAsync({
              handle: draft.handle,
              name: draft.name,
              bio: draft.bio,
              headline: draft.headline,
              avatarUrl: draft.avatarUrl,
              bannerUrl: draft.bannerUrl,
              theme: draft.theme,
              accentColor: draft.accentColor,
              buttonStyle: draft.buttonStyle,
              fontFamily: draft.fontFamily,
              backgroundStyle: draft.backgroundStyle,
            })
            .then(() => undefined)
        }
      />

      <AdminCreatorPagePreview profile={profile} links={links} publicHandle={detail.handle} />

      <AdminCreatorPageLinkManager
        links={detail.links}
        onSave={(draft) =>
          mutations.upsertLink
            .mutateAsync({
              id: draft.id,
              title: draft.title,
              url: draft.url,
              icon: draft.icon,
              featured: draft.featured,
              scheduled: draft.scheduled || null,
              kind: draft.kind,
              isVisible: draft.isVisible,
              position:
                draft.id === null
                  ? detail.links.reduce((maximum, link) => Math.max(maximum, link.position), -1) + 1
                  : undefined,
            })
            .then(() => undefined)
        }
        onVisibility={(linkId, isVisible) =>
          mutations.setLinkVisibility.mutateAsync({ linkId, isVisible }).then(() => undefined)
        }
        onReorder={(orderedIds) =>
          mutations.reorderLinks.mutateAsync({ orderedIds }).then(() => undefined)
        }
        onDelete={(linkId) => mutations.deleteLink.mutateAsync({ linkId }).then(() => undefined)}
      />

      <AdminCreatorPageAuditPanel
        items={auditQuery.data ?? []}
        pending={auditQuery.isPending || auditQuery.isFetching}
        error={auditQuery.isError}
        onRetry={() => void auditQuery.refetch()}
      />
    </div>
  );
}
