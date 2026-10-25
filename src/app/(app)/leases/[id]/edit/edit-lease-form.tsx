"use client";

import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useWatch,
  type Control,
  type FieldErrors,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { LeaseTermsFields } from "@/components/app/lease-terms-fields";
import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { formatPeso } from "@/domain/money/money";
import { isIsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate } from "@/domain/time/manila";
import { useActionForm } from "@/hooks/use-action-form";
import { updateLeaseSchema, type LeaseTermsInput } from "@/schemas/lease";
import { previewChargesAction } from "../../../payments/actions";
import { updateLeaseAction } from "../../actions";

type Values = z.input<typeof updateLeaseSchema>;

const LABELS: Record<string, string> = {
  unitId: "Unit",
  tenantId: "Tenant",
  startDate: "First day",
  endDate: "Last day",
  monthlyRent: "Monthly rent",
  rentDueDay: "Rent due day",
  securityDeposit: "Security deposit",
  advanceRentType: "Advance rent",
  advanceRentMonths: "Advance rent months",
  advanceRentAmount: "Advance rent amount",
  escalationType: "Rent increases",
  escalationPercent: "Increase %",
  escalationEveryMonths: "Increase every (months)",
  escalationSteps: "Rent changes on dates",
  remarks: "Remarks",
};

const MONEY = new Set(["monthlyRent", "securityDeposit", "advanceRentAmount"]);

function normalise(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (MONEY.has(key)) return Number(String(v).replace(/[₱,\s]/g, "")).toFixed(2);
  if (key === "escalationPercent") return String(Number(v));
  if (key === "escalationSteps") {
    return JSON.stringify(
      (v as { date: string; monthlyRent: string }[])
        .map((s) => [s.date, Number(String(s.monthlyRent).replace(/,/g, "")).toFixed(2)])
        .sort(),
    );
  }
  return String(v);
}

function display(key: string, v: unknown, lookup: Record<string, string>): string {
  const n = normalise(key, v);
  if (n === "") return "(empty)";
  if (key === "unitId" || key === "tenantId") return lookup[n] ?? n;
  if (MONEY.has(key)) return formatPeso(n);
  if (isIsoDate(n)) return formatIsoDate(n);
  if (key === "escalationSteps") return `${(v as unknown[]).length} change(s)`;
  return n;
}

type ChargePreview = {
  added: { description: string; dueDate: string; amount: string }[];
  removed: { description: string; dueDate: string; amount: string }[];
  keptAsIs: {
    description: string;
    dueDate: string;
    amount: string;
    newAmount: string | null;
    why: string;
  }[];
};

/** What saving would do to the lease's charges. */
function ChargePreviewList({ preview }: { preview: ChargePreview | null }) {
  if (!preview) {
    return (
      <p className="text-muted-foreground flex items-center gap-2" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Checking how the charges change…
      </p>
    );
  }
  const { added, removed, keptAsIs } = preview;
  if (!added.length && !removed.length && !keptAsIs.length) {
    return <p aria-live="polite">The rent charges stay the same.</p>;
  }
  const line = (c: { description: string; dueDate: string; amount: string }) =>
    `${c.description} · due ${formatIsoDate(c.dueDate)} · ${formatPeso(c.amount)}`;
  return (
    <div className="space-y-3 rounded-lg border p-4" aria-live="polite">
      <p className="font-medium">What happens to the charges</p>
      {removed.length ? (
        <div>
          <p>Replaced ({removed.length}):</p>
          <ul className="text-muted-foreground list-disc pl-6">
            {removed.slice(0, 6).map((c, i) => (
              <li key={i} className="line-through">
                {line(c)}
              </li>
            ))}
            {removed.length > 6 ? <li>and {removed.length - 6} more</li> : null}
          </ul>
        </div>
      ) : null}
      {added.length ? (
        <div>
          <p>New ({added.length}):</p>
          <ul className="list-disc pl-6">
            {added.slice(0, 6).map((c, i) => (
              <li key={i}>{line(c)}</li>
            ))}
            {added.length > 6 ? <li>and {added.length - 6} more</li> : null}
          </ul>
        </div>
      ) : null}
      {keptAsIs.length ? (
        <div>
          <p className="text-warning font-medium">Kept as they are ({keptAsIs.length}):</p>
          <ul className="list-disc pl-6">
            {keptAsIs.map((c, i) => (
              <li key={i}>
                {line(c)} — {c.why}
                {c.newAmount
                  ? ` (the new terms would make it ${formatPeso(c.newAmount)}; adjust with a charge if needed)`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function EditLeaseForm({
  leaseId,
  units,
  tenants,
  original,
}: {
  leaseId: string;
  units: { id: string; label: string }[];
  tenants: { id: string; label: string }[];
  original: Values;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<ChargePreview | null>(null);
  const { form, error, pending, onSubmit, errors } = useActionForm(
    updateLeaseSchema,
    original,
    async (values) => {
      const r = await updateLeaseAction(leaseId, values);
      if (r.ok) {
        toast.success("Lease updated ✓");
        router.push(`/leases/${leaseId}`);
      } else {
        setConfirming(false);
      }
      return r;
    },
  );
  const values = useWatch({ control: form.control }) as Values;
  const lookup = Object.fromEntries([...units, ...tenants].map((x) => [x.id, x.label]));
  const relevant = (k: string) => {
    if (k.startsWith("advanceRent") && k !== "advanceRentType")
      return values.advanceRentType === (k === "advanceRentMonths" ? "MONTHS" : "AMOUNT");
    if (k === "escalationPercent" || k === "escalationEveryMonths")
      return values.escalationType === "PERCENT";
    if (k === "escalationSteps") return values.escalationType === "SCHEDULE";
    return true;
  };
  const changes = Object.keys(LABELS)
    .filter(relevant)
    .filter(
      (k) =>
        normalise(k, (original as Record<string, unknown>)[k]) !==
        normalise(k, (values as Record<string, unknown>)[k]),
    );

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-4xl">
      {error ? <FormAlert className="mb-6">{error}</FormAlert> : null}
      {confirming ? (
        <Card>
          <CardHeader>
            <CardTitle>Please confirm these changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-lg border">
              {changes.map((k) => (
                <li key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-3">
                  <span className="font-medium">{LABELS[k]}</span>
                  <span className="text-muted-foreground line-through">
                    {display(k, (original as Record<string, unknown>)[k], lookup)}
                  </span>
                  <span className="font-medium">
                    {display(k, (values as Record<string, unknown>)[k], lookup)}
                  </span>
                </li>
              ))}
            </ul>
            <ChargePreviewList preview={preview} />
            <p className="text-muted-foreground">
              Reminder dates follow the new end date automatically. Only future, unpaid rent charges
              are recalculated; payments already recorded are never changed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Unit and tenant</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field id="unitId" label="Unit" required error={errors.unitId?.message}>
                <NativeSelect
                  {...fieldAria("unitId", errors.unitId?.message)}
                  {...form.register("unitId")}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="tenantId" label="Tenant" required error={errors.tenantId?.message}>
                <NativeSelect
                  {...fieldAria("tenantId", errors.tenantId?.message)}
                  {...form.register("tenantId")}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <LeaseTermsFields
                control={form.control as unknown as Control<LeaseTermsInput>}
                register={form.register as unknown as UseFormRegister<LeaseTermsInput>}
                errors={errors as FieldErrors<LeaseTermsInput>}
              />
            </CardContent>
          </Card>
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => (confirming ? setConfirming(false) : router.push(`/leases/${leaseId}`))}
        >
          {confirming ? (
            <>
              <ChevronLeft aria-hidden /> Back to editing
            </>
          ) : (
            "Cancel"
          )}
        </Button>
        {confirming ? (
          <Button key="save" type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Save {changes.length} change{changes.length === 1 ? "" : "s"}
          </Button>
        ) : (
          // A different key stops React reusing this <button> as the submit button.
          <Button
            key="next"
            type="button"
            size="lg"
            disabled={changes.length === 0}
            onClick={async () => {
              if (
                await form.trigger(Object.keys(original) as Path<Values>[], { shouldFocus: true })
              ) {
                setPreview(null);
                setConfirming(true);
                const r = await previewChargesAction(leaseId, form.getValues());
                if (r.ok) setPreview(r.data);
              }
            }}
          >
            {changes.length === 0 ? (
              "Nothing changed yet"
            ) : (
              <>
                Review {changes.length} change{changes.length === 1 ? "" : "s"}{" "}
                <ChevronRight aria-hidden />
              </>
            )}
          </Button>
        )}
      </div>
    </form>
  );
}
