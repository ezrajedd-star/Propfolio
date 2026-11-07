"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import Script from "next/script";
import { useRef, useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { LegalCheckbox } from "@/components/auth/legal-checkbox";
import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUpSchema } from "@/schemas/signup";
import {
  resendSignUpCodeAction,
  restartSignUpAction,
  startSignUpAction,
  verifySignUpCodeAction,
} from "./actions";

type Values = z.input<typeof signUpSchema>;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

/** "Start free": the form, then the 6-digit code on the same screen. */
export function SignUpFlow({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [email, setEmail] = useState<string | null>(null);
  return email ? (
    <CodeStep email={email} onRestart={() => setEmail(null)} />
  ) : (
    <SignUpForm turnstileSiteKey={turnstileSiteKey} onSent={setEmail} />
  );
}

function SignUpForm({
  turnstileSiteKey,
  onSent,
}: {
  turnstileSiteKey: string | null;
  onSent: (email: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const botBox = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const form = useForm<Values>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      companyName: "",
      acceptLegal: false as unknown as true,
      botToken: "",
    },
  });
  const { errors } = form.formState;
  const accepted = form.watch("acceptLegal") === true;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const r = await startSignUpAction(values);
      if (r.ok) {
        onSent(r.data.email);
        return;
      }
      setError(r.message);
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
        form.setError(k as Path<Values>, { message: v });
      }
      if (turnstileSiteKey) window.turnstile?.reset(widget.current);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="name" label="Your name" error={errors.name?.message}>
        <Input
          {...fieldAria("name", errors.name?.message)}
          autoComplete="name"
          autoFocus
          {...form.register("name")}
        />
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          {...form.register("email")}
        />
      </Field>
      <Field
        id="password"
        label="Password"
        hint="At least 12 characters. A short sentence works well."
        error={errors.password?.message}
      >
        <PasswordInput
          {...fieldAria("password", errors.password?.message, true)}
          autoComplete="new-password"
          {...form.register("password")}
        />
      </Field>
      <Field
        id="companyName"
        label="The name you lease under"
        hint="Your company's name, or your own name if you lease as a person."
        error={errors.companyName?.message}
      >
        <Input
          {...fieldAria("companyName", errors.companyName?.message, true)}
          autoComplete="organization"
          {...form.register("companyName")}
        />
      </Field>
      <LegalCheckbox
        checked={accepted}
        onChange={(v) =>
          form.setValue("acceptLegal", v as true, { shouldValidate: form.formState.isSubmitted })
        }
        error={errors.acceptLegal?.message}
      />
      {turnstileSiteKey ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => {
              if (!botBox.current || !window.turnstile || widget.current) return;
              widget.current = window.turnstile.render(botBox.current, {
                sitekey: turnstileSiteKey,
                appearance: "interaction-only",
                callback: (token: string) => form.setValue("botToken", token),
              });
            }}
          />
          <div ref={botBox} />
        </>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Creating your account…" : "Start free"}
      </Button>
    </form>
  );
}

function CodeStep({ email, onRestart }: { email: string; onRestart: () => void }) {
  const [pending, start] = useTransition();
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    const code = input.current?.value ?? "";
    start(async () => {
      // On success the action redirects into the app.
      const r = await verifySignUpCodeAction({ code });
      if (r.ok) return;
      if (r.fieldErrors?.code) setFieldError(r.fieldErrors.code);
      else setError(r.message);
      input.current?.select();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="flex gap-3">
        <MailCheck className="text-primary mt-0.5 size-6 shrink-0" aria-hidden />
        <p>
          We sent a 6-digit code to <span className="font-semibold">{email}</span>. Type it below to
          confirm your email. It works for 15 minutes.
        </p>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="code" label="Code" error={fieldError ?? undefined}>
        <Input
          ref={input}
          {...fieldAria("code", fieldError ?? undefined)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          className="w-40 text-lg tracking-widest tabular-nums"
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Checking…" : "Confirm and continue"}
      </Button>
      <div className="flex flex-wrap justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={sending}
          onClick={() =>
            startSend(async () => {
              const r = await resendSignUpCodeAction();
              if (r.ok) toast.success("New code sent ✓");
              else toast.error(r.message);
            })
          }
        >
          Send a new code
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            start(async () => {
              await restartSignUpAction();
              onRestart();
            })
          }
        >
          Use a different email
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        No email? Check your spam folder, or send a new code after a minute.
      </p>
    </form>
  );
}
