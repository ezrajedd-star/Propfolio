"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { DateInput } from "@/components/form/date-input";
import { Field, fieldAria } from "@/components/form/field";
import { MoneyInput } from "@/components/form/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, isIsoDate } from "@/domain/time/calendar-date";
import type { LeaseTermsInput } from "@/schemas/lease";
import { cn } from "@/lib/utils";

/** A choice shown as a row of large, labelled radio buttons. */
function ChoiceRow<V extends string>({
  name,
  value,
  onChange,
  options,
  legend,
}: {
  name: string;
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "has-[:focus-visible]:outline-ring inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 has-[:focus-visible]:outline-2",
              value === o.value ? "border-primary bg-primary-soft/60" : "bg-card hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-[var(--primary)]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Errs = FieldErrors<LeaseTermsInput> & {
  escalationSteps?: {
    message?: string;
    [i: number]: { date?: { message?: string }; monthlyRent?: { message?: string } };
  };
};

/**
 * Lease terms: dates (duration is calculated, never typed), rent, due day, deposit, advance and
 * escalation. Used by the new-lease wizard, renewal and editing.
 */
export function LeaseTermsFields({
  control,
  register,
  errors,
}: {
  // The parent form may have more fields (unit, tenant); only the terms are used here.
  control: Control<LeaseTermsInput>;
  register: UseFormRegister<LeaseTermsInput>;
  errors: FieldErrors<LeaseTermsInput>;
}) {
  const e = errors as Errs;
  const [startDate, endDate, advanceRentType, escalationType] = useWatch({
    control,
    name: ["startDate", "endDate", "advanceRentType", "escalationType"],
  });
  const steps = useFieldArray({ control, name: "escalationSteps" as never });
  const duration =
    isIsoDate(startDate ?? "") && isIsoDate(endDate ?? "") && endDate! > startDate!
      ? formatDuration(startDate!, endDate!)
      : null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Dates</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="startDate"
            label="First day of the lease"
            required
            error={e.startDate?.message}
          >
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <DateInput {...fieldAria("startDate", e.startDate?.message)} {...field} />
              )}
            />
          </Field>
          <Field id="endDate" label="Last day of the lease" required error={e.endDate?.message}>
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <DateInput {...fieldAria("endDate", e.endDate?.message)} {...field} />
              )}
            />
          </Field>
        </div>
        <p className="bg-muted rounded-lg px-4 py-3" aria-live="polite">
          <span className="text-muted-foreground">Lease length: </span>
          <span className="font-semibold">{duration ?? "choose both dates"}</span>
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Rent and deposit</h3>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="monthlyRent" label="Monthly rent" required error={e.monthlyRent?.message}>
            <MoneyInput
              {...fieldAria("monthlyRent", e.monthlyRent?.message)}
              {...register("monthlyRent")}
            />
          </Field>
          <Field
            id="rentDueDay"
            label="Rent due on day"
            required
            help="The day of the month rent is due. Days 29–31 aren't allowed because some months don't have them."
            error={e.rentDueDay?.message}
          >
            <Input
              {...fieldAria("rentDueDay", e.rentDueDay?.message)}
              inputMode="numeric"
              className="w-28"
              {...register("rentDueDay")}
            />
          </Field>
          <Field
            id="securityDeposit"
            label="Security deposit"
            required
            help="The amount agreed for this lease. Enter 0 if there is none."
            error={e.securityDeposit?.message}
          >
            <MoneyInput
              {...fieldAria("securityDeposit", e.securityDeposit?.message)}
              {...register("securityDeposit")}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <Controller
          control={control}
          name="advanceRentType"
          render={({ field }) => (
            <ChoiceRow
              name="advanceRentType"
              legend="Advance rent"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "NONE", label: "None" },
                { value: "MONTHS", label: "A number of months" },
                { value: "AMOUNT", label: "A fixed amount" },
              ]}
            />
          )}
        />
        {advanceRentType === "MONTHS" ? (
          <Field
            id="advanceRentMonths"
            label="How many months"
            required
            error={e.advanceRentMonths?.message}
          >
            <Input
              {...fieldAria("advanceRentMonths", e.advanceRentMonths?.message)}
              inputMode="numeric"
              className="w-28"
              {...register("advanceRentMonths")}
            />
          </Field>
        ) : null}
        {advanceRentType === "AMOUNT" ? (
          <div className="max-w-xs">
            <Field
              id="advanceRentAmount"
              label="Advance rent amount"
              required
              error={e.advanceRentAmount?.message}
            >
              <MoneyInput
                {...fieldAria("advanceRentAmount", e.advanceRentAmount?.message)}
                {...register("advanceRentAmount")}
              />
            </Field>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <Controller
          control={control}
          name="escalationType"
          render={({ field }) => (
            <ChoiceRow
              name="escalationType"
              legend="Rent increases (escalation)"
              value={field.value}
              onChange={(v) => {
                field.onChange(v);
                if (v === "SCHEDULE" && steps.fields.length === 0)
                  steps.append({ date: "", monthlyRent: "" } as never);
              }}
              options={[
                { value: "NONE", label: "No increases" },
                { value: "PERCENT", label: "By a percentage, regularly" },
                { value: "SCHEDULE", label: "Set amounts on set dates" },
              ]}
            />
          )}
        />
        {escalationType === "PERCENT" ? (
          <div className="flex flex-wrap items-start gap-4">
            <Field
              id="escalationPercent"
              label="Increase by"
              required
              error={e.escalationPercent?.message}
            >
              <div className="flex items-center gap-2">
                <Input
                  {...fieldAria("escalationPercent", e.escalationPercent?.message)}
                  inputMode="decimal"
                  className="w-24"
                  {...register("escalationPercent")}
                />
                <span>%</span>
              </div>
            </Field>
            <Field
              id="escalationEveryMonths"
              label="Every"
              required
              error={e.escalationEveryMonths?.message}
            >
              <div className="flex items-center gap-2">
                <Input
                  {...fieldAria("escalationEveryMonths", e.escalationEveryMonths?.message)}
                  inputMode="numeric"
                  className="w-24"
                  {...register("escalationEveryMonths")}
                />
                <span>months</span>
              </div>
            </Field>
          </div>
        ) : null}
        {escalationType === "SCHEDULE" ? (
          <div className="space-y-3">
            {e.escalationSteps?.message ? (
              <p role="alert" className="text-destructive text-sm font-medium">
                {e.escalationSteps.message}
              </p>
            ) : null}
            {steps.fields.map((f, i) => (
              <div key={f.id} className="flex flex-wrap items-start gap-4 rounded-lg border p-3">
                <Field
                  id={`step-${i}-date`}
                  label="From"
                  required
                  error={e.escalationSteps?.[i]?.date?.message}
                >
                  <Controller
                    control={control}
                    name={`escalationSteps.${i}.date` as "startDate"}
                    render={({ field }) => <DateInput id={`step-${i}-date`} {...field} />}
                  />
                </Field>
                <Field
                  id={`step-${i}-rent`}
                  label="New monthly rent"
                  required
                  error={e.escalationSteps?.[i]?.monthlyRent?.message}
                >
                  <MoneyInput
                    id={`step-${i}-rent`}
                    {...register(`escalationSteps.${i}.monthlyRent` as "monthlyRent")}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-8"
                  onClick={() => steps.remove(i)}
                  aria-label={`Remove rent change ${i + 1}`}
                >
                  <Trash2 aria-hidden /> Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => steps.append({ date: "", monthlyRent: "" } as never)}
            >
              <Plus aria-hidden /> Add a rent change
            </Button>
          </div>
        ) : null}
      </section>

      <Field id="remarks" label="Remarks" error={e.remarks?.message}>
        <Textarea {...fieldAria("remarks", e.remarks?.message)} rows={3} {...register("remarks")} />
      </Field>
    </div>
  );
}

/** Empty terms for a new lease. */
export const EMPTY_TERMS: LeaseTermsInput = {
  startDate: "",
  endDate: "",
  monthlyRent: "",
  rentDueDay: 1,
  securityDeposit: "",
  advanceRentType: "NONE",
  advanceRentMonths: null,
  advanceRentAmount: "",
  escalationType: "NONE",
  escalationPercent: "",
  escalationEveryMonths: 12,
  escalationSteps: [],
  remarks: "",
};
