import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminDeleteCreatorLink,
  adminReorderCreatorLinks,
  adminSetCreatorLinkVisibility,
  adminSetCreatorPageStatus,
  adminTransferCreatorPage,
  adminUpdateCreatorPage,
  adminUpsertCreatorLink,
  type DeleteLinkInput,
  type ReorderLinksInput,
  type SetLinkVisibilityInput,
  type SetStatusInput,
  type TransferInput,
  type UpdatePageInput,
  type UpsertLinkInput,
} from "@/lib/admin-creator-page-actions";
import { adminCreatorPageKeys } from "@/lib/use-admin-creator-page";

export function useAdminCreatorPageMutations(creatorProfileId: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminCreatorPageKeys.detail(creatorProfileId) }),
      queryClient.invalidateQueries({
        queryKey: ["admin-creator-page", "audit-history", creatorProfileId],
      }),
      queryClient.invalidateQueries({ queryKey: ["admin-creators"] }),
    ]);
  };

  return {
    updatePage: useMutation({
      mutationFn: (input: Omit<UpdatePageInput, "creatorProfileId">) =>
        adminUpdateCreatorPage({ data: { ...input, creatorProfileId } }),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: (input: Omit<SetStatusInput, "creatorProfileId">) =>
        adminSetCreatorPageStatus({ data: { ...input, creatorProfileId } }),
      onSuccess: invalidate,
    }),
    transfer: useMutation({
      mutationFn: (input: Omit<TransferInput, "creatorProfileId">) =>
        adminTransferCreatorPage({ data: { ...input, creatorProfileId } }),
      onSuccess: invalidate,
    }),
    upsertLink: useMutation({
      mutationFn: (input: Omit<UpsertLinkInput, "creatorProfileId">) =>
        adminUpsertCreatorLink({ data: { ...input, creatorProfileId } }),
      onSuccess: invalidate,
    }),
    setLinkVisibility: useMutation({
      mutationFn: (input: SetLinkVisibilityInput) => adminSetCreatorLinkVisibility({ data: input }),
      onSuccess: invalidate,
    }),
    reorderLinks: useMutation({
      mutationFn: (input: Omit<ReorderLinksInput, "creatorProfileId">) =>
        adminReorderCreatorLinks({ data: { ...input, creatorProfileId } }),
      onSuccess: invalidate,
    }),
    deleteLink: useMutation({
      mutationFn: (input: DeleteLinkInput) => adminDeleteCreatorLink({ data: input }),
      onSuccess: invalidate,
    }),
  };
}
