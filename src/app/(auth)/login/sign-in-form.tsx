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
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { signInSchema } from "@/schemas/auth";
import { signInAction } from "../actions";

type Values = z.input<typeof signInSchema>;

export function SignInForm({ next, google }: { next?: string; google: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", persistent: false },
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

  const persistent = form.watch("persistent") === true;
  const googleHref = `/api/auth/google/start?${new URLSearchParams({
    ...(next ? { next } : {}),
    ...(persistent ? { remember: "1" } : {}),
  }).toString()}`;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {google ? (
        <>
          <GoogleButton href={googleHref} label="Continue with Google" />
          <OrDivider />
        </>
      ) : null}
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
      <div className="flex items-start gap-3">
        <Checkbox
          id="persistent"
          checked={persistent}
          onCheckedChange={(v) => form.setValue("persistent", v === true)}
          className="mt-1"
        />
        <Label htmlFor="persistent" className="font-normal">
          Keep me signed in on this device for 30 days. Only tick this on your own computer or
          phone.
        </Label>
      </div>
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
      <p className="text-muted-foreground border-t pt-5 text-center">
        New to Propfolio?{" "}
        <Link
          href="/signup"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Start free
        </Link>
      </p>
    </form>
  );
}
