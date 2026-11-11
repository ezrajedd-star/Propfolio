"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  PARTNER_TYPES,
  partnerApplicationSchema,
  type PartnerApplicationInput,
} from "@/schemas/website-lead";
import { applyAsPartnerAction } from "./actions";

export function PartnerForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<PartnerApplicationInput>({
    resolver: zodResolver(partnerApplicationSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      phone: "",
      partnerType: undefined,
      message: "",
      website: "",
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const r = await applyAsPartnerAction(values);
      if (r.ok) {
        setSent(true);
        return;
      }
      setError(r.message);
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
        form.setError(k as Path<PartnerApplicationInput>, { message: v });
      }
    });
  });

  if (sent) {
    return (
      <div role="status" className="bg-success-soft rounded-2xl p-8 text-center">
        <CheckCircle2 className="text-success mx-auto size-10" aria-hidden />
        <h3 className="mt-3 text-2xl font-semibold">Thank you for applying!</h3>
        <p className="text-muted-foreground mt-2">
          We&apos;ll be in touch within one working day to talk it through.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="p-name" label="Your name" required error={errors.name?.message}>
          <Input
            {...fieldAria("p-name", errors.name?.message)}
            autoComplete="name"
            {...form.register("name")}
          />
        </Field>
        <Field id="p-email" label="Work email" required error={errors.email?.message}>
          <Input
            {...fieldAria("p-email", errors.email?.message)}
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
        </Field>
        <Field id="p-company" label="Company" required error={errors.company?.message}>
          <Input
            {...fieldAria("p-company", errors.company?.message)}
            autoComplete="organization"
            {...form.register("company")}
          />
        </Field>
        <Field id="p-phone" label="Mobile number" error={errors.phone?.message}>
          <Input
            {...fieldAria("p-phone", errors.phone?.message)}
            type="tel"
            autoComplete="tel"
            {...form.register("phone")}
          />
        </Field>
      </div>
      <Field
        id="p-type"
        label="What best describes you?"
        required
        error={errors.partnerType?.message}
      >
        <NativeSelect
          {...fieldAria("p-type", errors.partnerType?.message)}
          defaultValue=""
          {...form.register("partnerType")}
        >
          <option value="" disabled>
            Choose one
          </option>
          {PARTNER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="p-message"
        label="Tell us about the lessors you work with"
        error={errors.message?.message}
      >
        <Textarea
          {...fieldAria("p-message", errors.message?.message)}
          rows={3}
          {...form.register("message")}
        />
      </Field>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="p-website">Website</label>
        <input id="p-website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <p className="text-muted-foreground text-sm">
        We use these details only to talk to you about partnering. See our{" "}
        <Link href="/legal/privacy" className="text-primary underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Apply to partner
      </Button>
    </form>
  );
}
