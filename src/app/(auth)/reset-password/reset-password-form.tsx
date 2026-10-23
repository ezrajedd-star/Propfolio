"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";
import type { z } from "zod";

import { FormAlert } from "@/components/form/form-alert";
import { NewPasswordFields } from "@/components/form/new-password-fields";
import { Button } from "@/components/ui/button";
import { resetPasswordSchema } from "@/schemas/auth";
import { resetPasswordAction } from "../actions";

type Values = z.input<typeof resetPasswordSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await resetPasswordAction(values);
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
      <NewPasswordFields register={form.register} errors={form.formState.errors} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Save new password
      </Button>
    </form>
  );
}
