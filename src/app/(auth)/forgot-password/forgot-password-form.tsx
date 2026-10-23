"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema } from "@/schemas/auth";
import { forgotPasswordAction } from "../actions";

type Values = z.input<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors } = form.formState;

  if (sent) {
    return (
      <div className="space-y-6">
        <FormAlert tone="success">
          <p className="flex items-center gap-2 font-medium">
            <MailCheck className="size-5" aria-hidden /> Check your email
          </p>
          <p className="mt-1">
            If that address has an account, a link is on its way. It works for 60 minutes.
            Don&apos;t see it? Check your spam folder, or ask an Admin to reset your password.
          </p>
        </FormAlert>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await forgotPasswordAction(values);
      if (result.ok) setSent(true);
      else setError(result.message);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="username"
          autoFocus
          {...form.register("email")}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Email me a link
      </Button>
      <p className="text-center">
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
