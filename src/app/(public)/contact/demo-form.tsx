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
import { PORTFOLIO_SIZES, demoRequestSchema, type DemoRequestInput } from "@/schemas/demo";
import { requestDemoAction } from "./actions";

/** "Book a demo": a few details, then a plain thank-you. */
export function DemoForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<DemoRequestInput>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      phone: "",
      units: undefined,
      message: "",
      website: "",
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const r = await requestDemoAction(values);
      if (r.ok) {
        setSent(true);
        return;
      }
      setError(r.message);
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
        form.setError(k as Path<DemoRequestInput>, { message: v });
      }
    });
  });

  if (sent) {
    return (
      <div role="status" className="bg-success-soft rounded-2xl p-8 text-center">
        <CheckCircle2 className="text-success mx-auto size-10" aria-hidden />
        <h3 className="mt-3 text-2xl font-semibold">Thank you! We&apos;ll be in touch.</h3>
        <p className="text-muted-foreground mt-2">
          We&apos;ll email you within one working day to pick a time. In the meantime, you can try
          Propfolio yourself.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/signup">Start free</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="demo-name" label="Your name" required error={errors.name?.message}>
          <Input
            {...fieldAria("demo-name", errors.name?.message)}
            autoComplete="name"
            {...form.register("name")}
          />
        </Field>
        <Field id="demo-email" label="Work email" required error={errors.email?.message}>
          <Input
            {...fieldAria("demo-email", errors.email?.message)}
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
        </Field>
        <Field id="demo-company" label="Company" required error={errors.company?.message}>
          <Input
            {...fieldAria("demo-company", errors.company?.message)}
            autoComplete="organization"
            {...form.register("company")}
          />
        </Field>
        <Field id="demo-phone" label="Mobile number" error={errors.phone?.message}>
          <Input
            {...fieldAria("demo-phone", errors.phone?.message)}
            type="tel"
            autoComplete="tel"
            {...form.register("phone")}
          />
        </Field>
      </div>
      <Field
        id="demo-units"
        label="How many units do you lease out?"
        required
        error={errors.units?.message}
      >
        <NativeSelect
          {...fieldAria("demo-units", errors.units?.message)}
          defaultValue=""
          {...form.register("units")}
        >
          <option value="" disabled>
            Choose one
          </option>
          {PORTFOLIO_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} units
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="demo-message"
        label="Anything you'd like us to cover?"
        error={errors.message?.message}
      >
        <Textarea
          {...fieldAria("demo-message", errors.message?.message)}
          rows={3}
          {...form.register("message")}
        />
      </Field>
      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="demo-website">Website</label>
        <input id="demo-website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <p className="text-muted-foreground text-sm">
        We use these details only to arrange your demo. See our{" "}
        <Link href="/legal/privacy" className="text-primary underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Book my demo
      </Button>
    </form>
  );
}
