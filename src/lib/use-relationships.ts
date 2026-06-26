import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/lib/cabana-auth";
import { followCreator, getRelationshipState, unfollowCreator } from "@/lib/relationship-actions";

function relationshipKey(username: string) {
  return ["relationship", username.toLowerCase()] as const;
}

export function useRelationship(username: string) {
  const { user, loading: sessionLoading } = useAuthSession();
  const normalized = username.toLowerCase();
  const query = useQuery({
    queryKey: relationshipKey(normalized),
    enabled: !sessionLoading && !!user && !!normalized,
    queryFn: () => getRelationshipState({ data: { username: normalized } }),
  });

  return {
    ...query,
    signedIn: !!user,
    loading: sessionLoading || (!!user && query.isLoading),
  };
}

export function useFollow(username: string) {
  const queryClient = useQueryClient();
  const relationship = useRelationship(username);
  const normalized = username.toLowerCase();

  const followMutation = useMutation({
    mutationFn: () => followCreator({ data: { username: normalized } }),
    onSuccess: (state) => queryClient.setQueryData(relationshipKey(normalized), state),
  });

  const unfollowMutation = useMutation({
    mutationFn: () => unfollowCreator({ data: { username: normalized } }),
    onSuccess: (state) => queryClient.setQueryData(relationshipKey(normalized), state),
  });

  const following = relationship.data?.following ?? false;

  return {
    ...relationship,
    following,
    blockedByMe: relationship.data?.blockedByMe ?? false,
    followerCount: relationship.data?.followerCount ?? 0,
    pending: followMutation.isPending || unfollowMutation.isPending,
    error: relationship.error ?? followMutation.error ?? unfollowMutation.error,
    toggle: () => (following ? unfollowMutation.mutateAsync() : followMutation.mutateAsync()),
  };
}
