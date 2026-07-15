import { useState, type FormEvent } from "react";
import { Link2Off, UserRoundCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isValidCreatorAccountId,
  normalizeCreatorAccountId,
  safeCreatorEditorError,
} from "@/lib/cabana-admin-creator-editor";

export function AdminCreatorPageOwnership({
  claimed,
  ownerId,
  onTransfer,
}: {
  claimed: boolean;
  ownerId: string | null;
  onTransfer: (toUserId: string | null) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const transfer = async (toUserId: string | null) => {
    setPending(true);
    setError("");
    setSuccess("");
    try {
      await onTransfer(toUserId);
      setAccountId("");
      setSuccess(
        toUserId ? (claimed ? "Ownership transferred." : "Owner assigned.") : "Owner cleared.",
      );
    } catch (caught) {
      setError(safeCreatorEditorError(caught, "Couldn’t update page ownership. Try again."));
    } finally {
      setPending(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeCreatorAccountId(accountId);
    if (!isValidCreatorAccountId(normalized)) {
      setError("Enter a valid creator account UUID.");
      setSuccess("");
      return;
    }
    setConfirmTarget(normalized);
  };

  return (
    <section className="glass-strong space-y-4 rounded-3xl p-5" aria-labelledby="ownership-title">
      <div>
        <h2 id="ownership-title" className="font-display text-lg font-semibold">
          Ownership
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {claimed ? "This page is claimed." : "This page is currently ownerless."} Safe account
          search is not available in the current public schema, so assignment requires an exact
          creator account UUID. Email and auth-user data are never exposed here.
        </p>
        {ownerId ? (
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
            Current owner: {ownerId}
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="space-y-2" noValidate>
        <Label htmlFor="creator-owner-id">Creator account UUID</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="creator-owner-id"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setError("");
              setSuccess("");
            }}
            placeholder="00000000-0000-4000-8000-000000000000"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
          <Button type="submit" size="sm" loading={pending}>
            <UserRoundCheck className="h-3.5 w-3.5" /> {claimed ? "Transfer" : "Assign owner"}
          </Button>
        </div>
      </form>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {claimed ? "Transfer page ownership?" : "Assign this page owner?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {claimed
                ? "The current creator account will immediately lose control of this page."
                : "The selected creator account will immediately gain control of this page."}{" "}
              Confirm destination <span className="break-all font-mono">{confirmTarget}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirmTarget;
                setConfirmTarget(null);
                if (target) void transfer(target);
              }}
            >
              {claimed ? "Transfer ownership" : "Assign owner"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {claimed ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              <Link2Off className="h-3.5 w-3.5" /> Clear owner
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear this page owner?</AlertDialogTitle>
              <AlertDialogDescription>
                The creator account will lose ownership of this page. The page and its public status
                are not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void transfer(null)}>Clear owner</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-xs text-emerald-300">
          {success}
        </p>
      ) : null}
    </section>
  );
}
