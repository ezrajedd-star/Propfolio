"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { DateInput } from "@/components/form/date-input";
import { Field, fieldAria } from "@/components/form/field";
import { useActionForm } from "@/components/platform/use-action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_TYPES,
  LEAD_TYPE_LABELS,
} from "@/domain/pipeline/pipeline";
import { leadSchema } from "@/schemas/pipeline";
import { Controller } from "react-hook-form";
import { createLeadAction, updateLeadAction } from "../../actions";

export type LeadValues = z.input<typeof leadSchema>;

export const BLANK_LEAD: LeadValues = {
  name: "",
  company: "",
  type: "LESSOR",
  email: "",
  phone: "",
  source: "MY_NETWORK",
  portfolioSize: "",
  notes: "",
  nextFollowUp: "",
  ownerId: "",
  marketingConsent: false,
  consentSource: "",
};

export function LeadForm({
  leadId,
  initial,
  staff,
}: {
  leadId?: string;
  initial: LeadValues;
  staff: { id: string; name: string }[];
}) {
  const form = useForm<LeadValues>({ resolver: zodResolver(leadSchema), defaultValues: initial });
  const { errors } = form.formState;
  const consent = form.watch("marketingConsent");
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => (leadId ? updateLeadAction(leadId, v) : createLeadAction(v)),
    leadId ? "Saved ✓" : null,
    leadId ? form.getValues() : initial,
  );
  const text = (
    name: keyof LeadValues,
    label: string,
    opts: { required?: boolean; type?: string } = {},
  ) => (
    <Field id={`lead-${name}`} label={label} required={opts.required} error={errors[name]?.message}>
      <Input
        type={opts.type ?? "text"}
        {...fieldAria(`lead-${name}`, errors[name]?.message)}
        {...form.register(name)}
      />
    </Field>
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", "Name", { required: true })}
        {text("company", "Company")}
        <Field id="lead-type" label="Type" required error={errors.type?.message}>
          <NativeSelect id="lead-type" {...form.register("type")}>
            {LEAD_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAD_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="lead-source"
          label="Where they came from"
          required
          error={errors.source?.message}
        >
          <NativeSelect id="lead-source" {...form.register("source")}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {text("email", "Email", { type: "email" })}
        {text("phone", "Phone")}
        {text("portfolioSize", "Portfolio size (units, roughly)", { type: "number" })}
        <Field id="lead-nextFollowUp" label="Next follow-up" error={errors.nextFollowUp?.message}>
          <Controller
            control={form.control}
            name="nextFollowUp"
            render={({ field }) => (
              <DateInput
                {...fieldAria("lead-nextFollowUp", errors.nextFollowUp?.message)}
                {...field}
                value={field.value ?? ""}
              />
            )}
          />
        </Field>
        <Field id="lead-ownerId" label="Looked after by" error={errors.ownerId?.message}>
          <NativeSelect id="lead-ownerId" {...form.register("ownerId")}>
            <option value="">Nobody yet</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field id="lead-notes" label="Notes" error={errors.notes?.message}>
        <Textarea
          {...fieldAria("lead-notes", errors.notes?.message)}
          rows={4}
          {...form.register("notes")}
        />
      </Field>
      <fieldset className="space-y-3 rounded-xl border p-4">
        <legend className="px-1 font-medium">Marketing emails</legend>
        <label className="flex min-h-10 items-center gap-3">
          <input type="checkbox" className="size-5" {...form.register("marketingConsent")} />
          They agreed to get marketing emails from Propfolio
        </label>
        {consent ? text("consentSource", "Where and when they agreed", { required: true }) : null}
        <p className="text-muted-foreground text-sm">
          Without this, they never get marketing emails. Today&apos;s date is recorded with it.
        </p>
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {leadId ? "Save changes" : "Add lead"}
      </Button>
    </form>
  );
}
