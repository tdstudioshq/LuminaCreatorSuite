import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useAuthSession, cabanaAuth } from "@/lib/cabana-auth";
import { useAccountType, useMemberProfile, useUpdateMemberProfile } from "@/lib/use-account";
import {
  MEMBER_BIO_MAX,
  MEMBER_DISPLAY_NAME_MAX,
  defaultMemberProfile,
} from "@/lib/cabana-account";
import { SocialShell } from "@/components/cabana/social/SocialShell";
import { QueryErrorState } from "@/components/cabana/QueryErrorState";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "CABANA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Your CABANA member account." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useAuthSession();
  const {
    accountType,
    loading: accountLoading,
    error: accountError,
    refetch: refetchAccountType,
  } = useAccountType();

  // Auth gate (client-side, consistent with /dashboard) + creator bounce.
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: path } as never });
      return;
    }
    if (user && !accountLoading && accountType === "creator") {
      navigate({ to: "/dashboard" });
    }
  }, [loading, user, accountLoading, accountType, navigate, path]);

  // A failed account-type read must not trap the member on a permanent spinner —
  // surface a retryable error instead.
  if (!loading && user && accountError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <QueryErrorState
          title="Couldn’t load your account"
          message="We couldn’t confirm your account details. Please try again."
          onRetry={() => refetchAccountType()}
          className="max-w-sm"
        />
      </div>
    );
  }

  if (loading || !user || accountLoading || accountType !== "member") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
          Loading your account…
        </div>
      </div>
    );
  }

  return <MemberAccount name={user.name} email={user.email} />;
}

function MemberAccount({ name, email }: { name: string; email: string }) {
  const navigate = useNavigate();
  const profileQuery = useMemberProfile();
  const updateProfile = useUpdateMemberProfile();

  const fallback = useMemo(() => defaultMemberProfile({ name }), [name]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the form once the profile read resolves (server action result).
  const loaded = profileQuery.data;
  useEffect(() => {
    if (profileQuery.isSuccess && displayName === null) {
      setDisplayName(loaded?.displayName?.trim() ? loaded.displayName : fallback.displayName);
      setBio(loaded?.bio ?? fallback.bio);
    }
  }, [profileQuery.isSuccess, loaded, fallback, displayName]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await updateProfile.mutateAsync({
      displayName: displayName ?? fallback.displayName,
      bio: bio ?? fallback.bio,
    });
    setSaved(true);
  };

  return (
    <SocialShell>
      <main className="mx-auto min-h-screen max-w-2xl border-x border-border/50 px-4 py-6 sm:px-6">
        <Link
          to="/discover"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Discover creators
        </Link>

        <header className="mt-6 mb-8">
          <p className="eyebrow">Member account</p>
          <h1 className="text-3xl font-semibold text-iridescent">Welcome, {name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the identity shown across your feed, conversations, and creator relationships.
          </p>
        </header>

        <section className="glass-strong rounded-2xl p-6">
          <h2 className="text-sm font-medium text-foreground">Profile</h2>
          {profileQuery.isLoading || displayName === null ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading profile…
            </div>
          ) : (
            <form onSubmit={onSave} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="member-name" className="text-xs text-muted-foreground">
                  Display name
                </label>
                <input
                  id="member-name"
                  value={displayName}
                  maxLength={MEMBER_DISPLAY_NAME_MAX}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setSaved(false);
                  }}
                  className="w-full rounded-xl bg-background/50 border border-border/60 px-3 py-2 text-sm text-foreground focus:border-primary/60 outline-none"
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="member-bio" className="text-xs text-muted-foreground">
                  Bio
                </label>
                <textarea
                  id="member-bio"
                  value={bio ?? ""}
                  maxLength={MEMBER_BIO_MAX}
                  onChange={(e) => {
                    setBio(e.target.value);
                    setSaved(false);
                  }}
                  rows={3}
                  className="w-full rounded-xl bg-background/50 border border-border/60 px-3 py-2 text-sm text-foreground focus:border-primary/60 outline-none resize-none"
                  placeholder="A little about you (optional)"
                />
              </div>
              {updateProfile.isError && (
                <p className="text-xs text-destructive">
                  Couldn’t save. {(updateProfile.error as Error)?.message ?? "Please try again."}
                </p>
              )}
              <button
                type="submit"
                disabled={updateProfile.isPending}
                className="btn-luxury justify-center"
              >
                {updateProfile.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                  </>
                ) : saved ? (
                  <>
                    <Check className="w-4 h-4" /> Saved
                  </>
                ) : (
                  "Save profile"
                )}
              </button>
            </form>
          )}
        </section>

        <section className="mt-6 glass rounded-2xl p-6">
          <h2 className="text-sm font-medium text-foreground">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground/90 truncate">{email}</dd>
            </div>
            {loaded?.username && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Username</dt>
                <dd className="text-foreground/90">@{loaded.username}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Account type</dt>
              <dd className="text-foreground/90">Member</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={async () => {
              await cabanaAuth.logout();
              navigate({ to: "/login" });
            }}
            className="btn-ghost mt-5 text-xs"
          >
            Sign out
          </button>
        </section>
      </main>
    </SocialShell>
  );
}
