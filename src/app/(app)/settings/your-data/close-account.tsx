"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

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
import { closeAccountAction } from "./actions";

/** Closing is confirmed by typing the account's name. */
export function CloseAccount({
  accountName,
  deleteAfter,
}: {
  accountName: string;
  deleteAfter: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      setFieldError(undefined);
      const r = await closeAccountAction({ confirmName: typed });
      if (r && !r.ok) {
        setError(r.message);
        setFieldError(r.fieldErrors?.confirmName);
      }
    });

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Close this account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive size-5" aria-hidden /> Close {accountName}?
            </DialogTitle>
            <DialogDescription>
              Everyone is signed out and nobody can sign in. No more reminder emails or charges. You
              can reopen it with the link we email you until <strong>{deleteAfter}</strong>; after
              that, all its data is deleted for good.
            </DialogDescription>
          </DialogHeader>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id="confirm-name" label={`Type ${accountName} to confirm`} error={fieldError}>
            <Input
              {...fieldAria("confirm-name", fieldError)}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button variant="destructive" disabled={pending || !typed.trim()} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Close the account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
