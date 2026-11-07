"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { LegalCheckbox } from "@/components/auth/legal-checkbox";
import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { googleDetailsSchema } from "@/schemas/signup";
import { googleDetailsAction } from "../actions";

type Values = z.input<typeof googleDetailsSchema>;

export function GoogleDetailsForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(googleDetailsSchema),
    defaultValues: { companyName: "", acceptLegal: false as unknown as true },
  });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setError(null);
      const r = await googleDetailsAction(values);
      if (!r.ok) setError(r.message);
    }),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field
        id="companyName"
        label="The name you lease under"
        hint="Your company's name, or your own name if you lease as a person."
        error={errors.companyName?.message}
      >
        <Input
          {...fieldAria("companyName", errors.companyName?.message, true)}
          autoComplete="organization"
          autoFocus
          {...form.register("companyName")}
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
        {pending ? "Creating your account…" : "Start free"}
      </Button>
    </form>
  );
}
