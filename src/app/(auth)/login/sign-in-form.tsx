"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInSchema } from "@/schemas/auth";
import { signInAction } from "../actions";

type Values = z.input<typeof signInSchema>;

export function SignInForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await signInAction(values, next);
      // On success the action redirects, so we only get here on failure.
      if (result && !result.ok) {
        setError(result.message);
        form.resetField("password");
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
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center">
        <Link
          href="/forgot-password"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
