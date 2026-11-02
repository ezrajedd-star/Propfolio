"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORM_PASSWORD_MIN_LENGTH, platformSetupSchema } from "@/schemas/platform";
import { completePlatformSetupAction } from "../../actions";

type Values = z.input<typeof platformSetupSchema>;

export function PlatformSetupForm({
  token,
  email,
  secret,
  qrSvg,
}: {
  token: string;
  email: string;
  secret: string;
  /** Generated on the server from our own data (the QR code library's SVG output). */
  qrSvg: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(platformSetupSchema),
    defaultValues: { token, password: "", confirmPassword: "", code: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await completePlatformSetupAction(values);
      if (result && !result.ok) {
        setError(result.message);
        for (const [k, v] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(k as Path<Values>, { message: v });
        }
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <input type="hidden" autoComplete="username" value={email} readOnly />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Choose a password</h2>
        <Field
          id="password"
          label="Password"
          hint={`At least ${PLATFORM_PASSWORD_MIN_LENGTH} characters. A short sentence you'll remember works well.`}
          error={errors.password?.message}
        >
          <PasswordInput
            {...fieldAria("password", errors.password?.message, true)}
            autoComplete="new-password"
            {...form.register("password")}
          />
        </Field>
        <Field id="confirmPassword" label="Type it again" error={errors.confirmPassword?.message}>
          <PasswordInput
            {...fieldAria("confirmPassword", errors.confirmPassword?.message)}
            autoComplete="new-password"
            {...form.register("confirmPassword")}
          />
        </Field>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Add Propfolio to your authenticator app</h2>
        <p>In the app, choose “Add account” and scan this code with your phone&apos;s camera.</p>
        <div
          role="img"
          aria-label="QR code for your authenticator app"
          className="mx-auto w-48 rounded-lg border bg-white p-2"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="text-muted-foreground text-sm">
          Can&apos;t scan? Choose “Enter a setup key” and type:{" "}
          <span className="text-foreground font-mono break-all">{secret}</span>
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Type the code it shows</h2>
        <Field id="code" label="6-digit code" error={errors.code?.message}>
          <Input
            {...fieldAria("code", errors.code?.message)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="w-40 tracking-widest tabular-nums"
            {...form.register("code")}
          />
        </Field>
      </section>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Finish set-up
      </Button>
    </form>
  );
}
