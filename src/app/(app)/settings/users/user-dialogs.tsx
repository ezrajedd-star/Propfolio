"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { createUserSchema } from "@/schemas/user";
import { updateUserAction } from "./actions";
import { RolePicker } from "./role-picker";
import type { UserRow } from "./types";

type Values = z.input<typeof createUserSchema>;

function UserForm({
  defaultValues,
  roleLocked,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues: Partial<Values>;
  /** Why the role can't be changed here, or nothing when it can. */
  roleLocked?: string;
  submitLabel: string;
  onSubmit: (
    values: Values,
  ) => Promise<{ ok: boolean; message?: string; fieldErrors?: Record<string, string> }>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(createUserSchema), defaultValues });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (!result.ok) {
        setError(result.message ?? "Please check the form.");
        for (const [k, v] of Object.entries(result.fieldErrors ?? {}))
          form.setError(k as Path<Values>, { message: v });
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="name" label="Full name" required error={errors.name?.message}>
        <Input
          {...fieldAria("name", errors.name?.message)}
          autoComplete="off"
          {...form.register("name")}
        />
      </Field>
      <Field
        id="email"
        label="Work email"
        required
        hint="They will use this to sign in and to receive reminder emails."
        error={errors.email?.message}
      >
        <Input
          {...fieldAria("email", errors.email?.message, true)}
          type="email"
          autoComplete="off"
          {...form.register("email")}
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-base font-medium">
          Role <span className="text-muted-foreground text-sm font-normal">(required)</span>
        </legend>
        {roleLocked ? (
          <p className="text-muted-foreground">{roleLocked}</p>
        ) : (
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <RolePicker value={field.value} onChange={field.onChange} invalid={!!errors.role} />
            )}
          />
        )}
        {errors.role ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {errors.role.message}
          </p>
        ) : null}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditUserDialog({
  user,
  isSelf,
  open,
  onOpenChange,
}: {
  user: UserRow;
  isSelf: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const roleLock =
    user.role === "OWNER"
      ? "This is the account's Owner. The Owner's role can't be changed."
      : isSelf
        ? "You can't change your own role. Ask another Admin."
        : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.name}</DialogTitle>
          <DialogDescription>
            If you change the email, we&apos;ll let them know at both the old and the new address.
          </DialogDescription>
        </DialogHeader>
        <UserForm
          // The Owner role isn't one an Admin can pick; it is shown as locked instead.
          defaultValues={{
            name: user.name,
            email: user.email,
            role: user.role === "OWNER" ? "ADMIN" : user.role,
          }}
          roleLocked={roleLock}
          submitLabel="Save changes"
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values) => {
            const result = await updateUserAction(
              user.id,
              roleLock ? { name: values.name, email: values.email } : values,
            );
            if (result.ok) {
              toast.success("Saved ✓");
              onOpenChange(false);
            }
            return result;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
