"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2, MailPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type Role } from "@/domain/auth/roles";
import { formatIsoDate } from "@/domain/time/manila";
import { inviteSchema } from "@/schemas/user";
import { inviteAction, revokeInvitationAction } from "./actions";
import { RolePicker } from "./role-picker";

type Values = z.input<typeof inviteSchema>;

/** Invite someone by email: they choose their own password (or use Google). */
export function InviteButton({ full }: { full: boolean }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "LEASING_STAFF" },
  });
  const { errors } = form.formState;
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSent(null);
      setCopied(false);
      setError(null);
      form.reset();
    }
  };
  const submit = form.handleSubmit((values) =>
    start(async () => {
      setError(null);
      const r = await inviteAction(values);
      if (r.ok) setSent({ email: values.email, link: r.data.link });
      else {
        setError(r.message);
        for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
          form.setError(k as Path<Values>, { message: v });
        }
      }
    }),
  );

  return (
    <>
      <Button
        onClick={() =>
          full
            ? toast.error(
                "Every seat on your plan is taken. Turn someone off or withdraw an invitation first.",
              )
            : setOpen(true)
        }
      >
        <MailPlus aria-hidden /> Invite someone
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          {sent ? (
            <>
              <DialogHeader>
                <DialogTitle>Invitation sent ✓</DialogTitle>
                <DialogDescription>
                  We emailed {sent.email} a link to join. It works for 7 days. If the email
                  doesn&apos;t arrive, send them this link yourself:
                </DialogDescription>
              </DialogHeader>
              <p
                className="bg-muted/50 rounded-lg border p-3 font-mono text-sm break-all"
                data-testid="invite-link"
              >
                {sent.link}
              </p>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(sent.link);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button onClick={() => close(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-5">
              <DialogHeader>
                <DialogTitle>Invite someone</DialogTitle>
                <DialogDescription>
                  They get an email with a link to join. They choose their own password, or use
                  Google.
                </DialogDescription>
              </DialogHeader>
              {error ? <FormAlert>{error}</FormAlert> : null}
              <Field id="email" label="Their work email" required error={errors.email?.message}>
                <Input
                  {...fieldAria("email", errors.email?.message)}
                  type="email"
                  autoComplete="off"
                  autoFocus
                  {...form.register("email")}
                />
              </Field>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-base font-medium">Role</legend>
                <Controller
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <RolePicker
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.role}
                    />
                  )}
                />
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: Role;
  expiresOn: string;
}

/** Open invitations: they hold a seat until used, withdrawn or expired. */
export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  const [pending, start] = useTransition();
  if (invitations.length === 0) return null;
  return (
    <section aria-labelledby="pending-invitations" className="mb-8">
      <h2 id="pending-invitations" className="mb-3 text-xl font-semibold">
        Invited, not joined yet
      </h2>
      <ul className="divide-y rounded-xl border">
        {invitations.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span>
              <span className="block font-medium break-all">{i.email}</span>
              <span className="text-muted-foreground text-sm">
                {ROLE_LABELS[i.role]} · link works until {formatIsoDate(i.expiresOn)}
              </span>
            </span>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await revokeInvitationAction(i.id);
                  if (r.ok) toast.success("Invitation withdrawn ✓");
                  else toast.error(r.message);
                })
              }
            >
              Withdraw
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
