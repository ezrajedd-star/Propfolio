"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { LegalCheckbox } from "@/components/auth/legal-checkbox";
import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptInvitationSchema } from "@/schemas/user";
import { acceptAsNewPersonAction, acceptSignedInAction } from "./actions";

type Values = z.input<typeof acceptInvitationSchema>;

/** Someone new: their name and their own password (the email is the invitation's). */
export function JoinForm({ token, email }: { token: string; email: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { name: "", password: "", acceptLegal: false as unknown as true },
  });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setError(null);
      const r = await acceptAsNewPersonAction(token, values);
      if (r && !r.ok) {
        setError(r.message);
        for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
          form.setError(k as Path<Values>, { message: v });
        }
      }
    }),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field id="email" label="Email">
        <Input id="email" value={email} readOnly disabled />
      </Field>
      <Field id="name" label="Your name" error={errors.name?.message}>
        <Input
          {...fieldAria("name", errors.name?.message)}
          autoComplete="name"
          autoFocus
          {...form.register("name")}
        />
      </Field>
      <Field
        id="password"
        label="Choose a password"
        hint="At least 12 characters. A short sentence works well."
        error={errors.password?.message}
      >
        <PasswordInput
          {...fieldAria("password", errors.password?.message, true)}
          autoComplete="new-password"
          {...form.register("password")}
        />
      </Field>
      <LegalCheckbox
        checked={form.watch("acceptLegal") === true}
        onChange={(v) =>
          form.setValue("acceptLegal", v as true, { shouldValidate: form.formState.isSubmitted })
        }
        error={errors.acceptLegal?.message}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Joining…" : "Join the team"}
      </Button>
    </form>
  );
}

export function JoinSignedInButton({ token, accountName }: { token: string; accountName: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await acceptSignedInAction(token);
          if (r && !r.ok) toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      Join {accountName}
    </Button>
  );
}
