"use client";

import { Loader2, MailPlus, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/domain/time/manila";
import { findPendingSignUpAction, resendSignUpCodeAction } from "../../../actions";

type Found = {
  id: string;
  email: string;
  name: string;
  codesSent: number;
  expiresAt: Date;
  createdAt: Date;
  expired: boolean;
};

export function SignUpLookup({ canResend }: { canResend: boolean }) {
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<Found | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <form
        className="flex max-w-lg flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await findPendingSignUpAction({ email });
            if (r.ok) setFound(r.data);
            else toast.error(r.message);
          });
        }}
      >
        <div className="min-w-60 flex-1">
          <label htmlFor="signupEmail" className="mb-1 block font-medium">
            Their email address, exactly
          </label>
          <Input
            id="signupEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
          Find
        </Button>
      </form>
      {found === null ? (
        <p role="status">
          No sign-up is waiting for a code with that email. They may need to start again, or they
          already have an account (search Accounts).
        </p>
      ) : found ? (
        <div role="status" className="bg-card max-w-lg space-y-2 rounded-xl border p-4">
          <p className="font-medium">
            {found.name} ({found.email})
          </p>
          <p className="text-muted-foreground">
            Started {formatDateTime(found.createdAt)} · {found.codesSent} code
            {found.codesSent === 1 ? "" : "s"} sent ·{" "}
            {found.expired
              ? "the last code has expired"
              : `code works until ${formatDateTime(found.expiresAt)}`}
          </p>
          {canResend ? (
            <>
              <Button type="button" onClick={() => setOpen(true)}>
                <MailPlus aria-hidden /> Send a new code
              </Button>
              <ReasonDialog
                open={open}
                onOpenChange={setOpen}
                title="Send a new sign-up code?"
                description={`A new 6-digit code goes to ${found.email}. Ask them to check spam too.`}
                confirmLabel="Send code"
                done="New code sent ✓"
                placeholder="e.g. Ticket 1045: code email never arrived"
                onConfirm={(reason) => resendSignUpCodeAction(found.id, { reason })}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
