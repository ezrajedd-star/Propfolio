"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NewPasswordFields } from "@/components/form/new-password-fields";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { changePasswordSchema } from "@/schemas/auth";
import { changePasswordAction, signOutAction } from "../actions";

type Values = z.input<typeof changePasswordSchema>;

export function ChangePasswordForm({ firstTime }: { firstTime: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await changePasswordAction(values);
      if (result && !result.ok) {
        setError(result.message);
        for (const [k, v] of Object.entries(result.fieldErrors ?? {}))
          form.setError(k as Path<Values>, { message: v });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field
        id="currentPassword"
        label={firstTime ? "Temporary password" : "Current password"}
        required
        error={errors.currentPassword?.message}
      >
        <PasswordInput
          {...fieldAria("currentPassword", errors.currentPassword?.message)}
          autoComplete="current-password"
          autoFocus
          {...form.register("currentPassword")}
        />
      </Field>
      <NewPasswordFields register={form.register} errors={errors} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Save new password
      </Button>
      {firstTime ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => startTransition(() => signOutAction())}
        >
          Sign out instead
        </Button>
      ) : null}
    </form>
  );
}
