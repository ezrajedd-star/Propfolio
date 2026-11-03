"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platformSignInSchema } from "@/schemas/platform";
import { platformSignInAction } from "../../actions";

type Values = z.input<typeof platformSignInSchema>;

export function PlatformSignInForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(platformSignInSchema),
    defaultValues: { email: "", password: "", code: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await platformSignInAction(values);
      // On success the action redirects, so we only get here on failure.
      if (result && !result.ok) {
        setError(result.message);
        form.resetField("password");
        form.resetField("code");
        form.setFocus("password");
      }
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
      <Field id="password" label="Password" error={errors.password?.message}>
        <PasswordInput
          {...fieldAria("password", errors.password?.message)}
          autoComplete="current-password"
          {...form.register("password")}
        />
      </Field>
      <Field
        id="code"
        label="6-digit code"
        help="Open your authenticator app and type the code shown for Propfolio."
        error={errors.code?.message}
      >
        <Input
          {...fieldAria("code", errors.code?.message, true)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="w-40 tracking-widest tabular-nums"
          {...form.register("code")}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
