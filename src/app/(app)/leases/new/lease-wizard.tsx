"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  useWatch,
  type Control,
  type FieldErrors,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { OccupancyBadge } from "@/components/app/lease-badges";
import { EMPTY_TERMS, LeaseTermsFields } from "@/components/app/lease-terms-fields";
import { LeaseReview } from "@/components/app/lease-review";
import { NewTenantForm } from "@/components/app/new-tenant-form";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { TermsForDescription } from "@/domain/leases/describe";
import type { Occupancy } from "@/domain/leases/occupancy";
import type { ReminderConfig } from "@/domain/reminders/config";
import { formatDateTime, formatIsoDate } from "@/domain/time/manila";
import { useActionForm } from "@/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { createLeaseSchema, type LeaseTermsInput } from "@/schemas/lease";
import { searchTenantsAction } from "@/app/(app)/tenants/actions";
import { createLeaseAction, discardLeaseDraftAction, saveLeaseDraftAction } from "../actions";

export interface WizardUnit {
  id: string;
  unitNumber: string;
  buildingId: string;
  buildingName: string;
  unitType: string;
  occupancy: Occupancy;
  currentTenant: string | null;
  currentEnd: string | null;
  reminderConfig: ReminderConfig;
}

type Values = z.input<typeof createLeaseSchema>;

const STEPS = [
  { title: "Unit", fields: ["unitId"] },
  { title: "Tenant", fields: ["tenantId"] },
  {
    title: "Terms",
    fields: [
      "startDate",
      "endDate",
      "monthlyRent",
      "rentDueDay",
      "securityDeposit",
      "advanceRentType",
      "advanceRentMonths",
      "advanceRentAmount",
      "escalationType",
      "escalationPercent",
      "escalationEveryMonths",
      "escalationSteps",
      "remarks",
    ],
  },
  { title: "Review and save", fields: [] },
] as const;

function Progress({ step }: { step: number }) {
  return (
    <div className="mb-6">
      <p className="mb-3 font-medium" aria-live="polite">
        Step {step} of 4 · {STEPS[step - 1]!.title}
      </p>
      <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.title} aria-current={i + 1 === step ? "step" : undefined}>
            <div className={cn("h-2 rounded-full", i + 1 <= step ? "bg-primary" : "bg-muted")} />
            <span
              className={cn(
                "mt-1 hidden text-sm sm:block",
                i + 1 === step ? "font-medium" : "text-muted-foreground",
              )}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function UnitStep({
  units,
  buildings,
  value,
  onChange,
  error,
}: {
  units: WizardUnit[];
  buildings: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const selected = units.find((u) => u.id === value);
  const [buildingId, setBuildingId] = useState(
    selected?.buildingId ?? (buildings.length === 1 ? buildings[0]!.id : ""),
  );
  const [showAll, setShowAll] = useState(selected ? selected.occupancy !== "VACANT" : false);
  const visible = units.filter(
    (u) =>
      (!buildingId || u.buildingId === buildingId) &&
      (showAll || u.occupancy === "VACANT" || u.id === value),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-6">
        <div className="w-full max-w-xs space-y-2">
          <Label htmlFor="wizard-building">Building</Label>
          <NativeSelect
            id="wizard-building"
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
          >
            <option value="">All buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex h-11 items-center gap-3">
          <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="show-all" className="font-normal">
            Also show units that are occupied or unavailable
          </Label>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-destructive font-medium">
          {error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="bg-muted rounded-lg p-4">
          No vacant units here. Turn on &ldquo;Also show units that are occupied&rdquo; to lease a
          unit from a future date.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Unit"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {visible.map((u) => (
            <label
              key={u.id}
              className={cn(
                "has-[:focus-visible]:outline-ring flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline-2",
                value === u.id ? "border-primary bg-primary-soft/60" : "bg-card hover:bg-muted/60",
              )}
            >
              <input
                type="radio"
                name="unit"
                className="mt-1 accent-[var(--primary)]"
                checked={value === u.id}
                onChange={() => onChange(u.id)}
              />
              <span className="min-w-0 space-y-1">
                <span className="block font-semibold">Unit {u.unitNumber}</span>
                <span className="text-muted-foreground block text-sm">
                  {u.buildingName} · {u.unitType}
                </span>
                <OccupancyBadge occupancy={u.occupancy} />
                {u.currentTenant && u.currentEnd ? (
                  <span className="text-muted-foreground block text-sm">
                    {u.currentTenant} until {formatIsoDate(u.currentEnd)}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function TenantStep({
  value,
  name,
  onChange,
  privacyNotice,
  error,
}: {
  value: string;
  name?: string;
  onChange: (t: { id: string; displayName: string }, advance?: boolean) => void;
  privacyNotice: string;
  error?: string;
}) {
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; displayName: string; contactPerson: string | null }[]
  >([]);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(
      () =>
        startTransition(async () => {
          const r = await searchTenantsAction(q);
          if (r.ok) setResults(r.data);
        }),
      250,
    );
    return () => clearTimeout(t);
  }, [q]);

  if (mode === "new") {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" onClick={() => setMode("pick")}>
          <ChevronLeft aria-hidden /> Pick an existing tenant instead
        </Button>
        <NewTenantForm
          privacyNotice={privacyNotice}
          submitLabel="Add tenant and continue"
          onCreated={(t) => {
            toast.success(`${t.displayName} added ✓`);
            onChange(t, true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {value && name ? (
        <p className="bg-success-soft flex items-center gap-2 rounded-lg px-4 py-3">
          <Check className="text-success size-5" aria-hidden /> Selected: <strong>{name}</strong>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive font-medium">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full max-w-md">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            aria-label="Search tenants"
            placeholder="Search by name, contact or email"
            className="pl-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => setMode("new")}>
          <UserPlus aria-hidden /> Add a new tenant
        </Button>
      </div>
      <div
        role="radiogroup"
        aria-label="Tenant"
        aria-busy={loading}
        className="grid gap-2 sm:grid-cols-2"
      >
        {results.map((t) => (
          <label
            key={t.id}
            className={cn(
              "has-[:focus-visible]:outline-ring flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:focus-visible]:outline-2",
              value === t.id ? "border-primary bg-primary-soft/60" : "bg-card hover:bg-muted/60",
            )}
          >
            <input
              type="radio"
              name="tenant"
              className="accent-[var(--primary)]"
              checked={value === t.id}
              onChange={() => onChange(t)}
            />
            <span>
              <span className="block font-medium">{t.displayName}</span>
              {t.contactPerson ? (
                <span className="text-muted-foreground block text-sm">{t.contactPerson}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {!loading && results.length === 0 ? (
        <p className="text-muted-foreground">
          {q
            ? `No tenants match “${q}”. Add them as a new tenant.`
            : "No tenants yet. Add a new tenant."}
        </p>
      ) : null}
    </div>
  );
}

export function LeaseWizard({
  units,
  buildings,
  privacyNotice,
  today,
  draft,
  preset,
}: {
  units: WizardUnit[];
  buildings: { id: string; name: string }[];
  privacyNotice: string;
  today: string;
  draft: { step: number; values: Record<string, unknown>; savedAt: string } | null;
  preset: { unitId?: string; tenant?: { id: string; displayName: string } };
}) {
  const router = useRouter();
  const [step, setStep] = useState(
    draft?.step ?? (preset.unitId ? (preset.tenant ? 3 : 2) : preset.tenant ? 1 : 1),
  );
  const [restored, setRestored] = useState(draft !== null);
  const { tenantName: draftTenantName, ...draftValues } = (draft?.values ??
    {}) as Partial<Values> & { tenantName?: string };
  const [tenantName, setTenantName] = useState<string | undefined>(
    preset.tenant?.displayName ?? draftTenantName,
  );
  const initial: Values = {
    unitId: preset.unitId ?? "",
    tenantId: preset.tenant?.id ?? "",
    ...EMPTY_TERMS,
    ...draftValues,
  };
  const { form, error, setError, pending, onSubmit, errors } = useActionForm(
    createLeaseSchema,
    initial,
    async (values) => {
      const r = await createLeaseAction(values);
      if (r.ok) {
        toast.success(`Lease ${r.data.refNo} saved ✓`);
        router.push(`/leases/${r.data.id}`);
      } else if (r.fieldErrors) {
        // Send the user back to the step with the problem.
        const first = Object.keys(r.fieldErrors)[0] ?? "";
        const idx = STEPS.findIndex((s) =>
          (s.fields as readonly string[]).some((f) => first.startsWith(f)),
        );
        if (idx >= 0) setStep(idx + 1);
      }
      return r;
    },
  );

  const values = useWatch({ control: form.control }) as Values;
  const unit = units.find((u) => u.id === values.unitId);

  // Autosave the draft (debounced) whenever something changes.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(
      () => void saveLeaseDraftAction({ step, values: { ...values, tenantName } }),
      1200,
    );
    return () => clearTimeout(t);
  }, [values, step, tenantName]);

  const next = async () => {
    setError(null);
    const ok = await form.trigger(STEPS[step - 1]!.fields as unknown as Path<Values>[], {
      shouldFocus: true,
    });
    if (ok) {
      setStep((s) => Math.min(4, s + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const startOver = async () => {
    await discardLeaseDraftAction();
    form.reset({ unitId: "", tenantId: "", ...EMPTY_TERMS });
    setTenantName(undefined);
    setStep(1);
    setRestored(false);
  };

  return (
    <div className="max-w-4xl">
      {restored && draft ? (
        <FormAlert tone="info" className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              We kept the lease you were working on ({formatDateTime(new Date(draft.savedAt))}).
            </span>
            <Button type="button" variant="outline" size="sm" onClick={startOver}>
              Start over
            </Button>
          </div>
        </FormAlert>
      ) : null}
      <Progress step={step} />
      {/* Not a <form>: step 2 contains its own form (new tenant), and forms can't be nested. */}
      <div>
        <Card>
          <CardContent className="space-y-6">
            {error ? <FormAlert>{error}</FormAlert> : null}
            {step === 1 ? (
              <>
                <h2 className="text-xl font-semibold">Which unit is being leased?</h2>
                <UnitStep
                  units={units}
                  buildings={buildings}
                  value={values.unitId ?? ""}
                  onChange={(id) => form.setValue("unitId", id, { shouldValidate: true })}
                  error={errors.unitId?.message}
                />
              </>
            ) : null}
            {step === 2 ? (
              <>
                <h2 className="text-xl font-semibold">Who is the tenant?</h2>
                <TenantStep
                  value={values.tenantId ?? ""}
                  name={tenantName}
                  privacyNotice={privacyNotice}
                  error={errors.tenantId?.message}
                  onChange={(t, advance) => {
                    form.setValue("tenantId", t.id, { shouldValidate: true });
                    setTenantName(t.displayName);
                    if (advance) setStep(3);
                  }}
                />
              </>
            ) : null}
            {step === 3 ? (
              <>
                <h2 className="text-xl font-semibold">Lease terms</h2>
                <LeaseTermsFields
                  control={form.control as unknown as Control<LeaseTermsInput>}
                  register={form.register as unknown as UseFormRegister<LeaseTermsInput>}
                  errors={errors as FieldErrors<LeaseTermsInput>}
                />
              </>
            ) : null}
            {step === 4 ? (
              <>
                <h2 className="text-xl font-semibold">Check the details, then save</h2>
                <LeaseReview
                  unitLabel={
                    unit ? `Unit ${unit.unitNumber}, ${unit.buildingName} (${unit.unitType})` : "—"
                  }
                  tenantName={tenantName ?? "—"}
                  terms={
                    values as unknown as TermsForDescription & {
                      startDate: string;
                      endDate: string;
                    }
                  }
                  reminderConfig={
                    unit?.reminderConfig ?? {
                      leadDays: [90, 60, 30],
                      repeat: "NONE",
                      repeatWeekday: null,
                      afterExpiryDays: 0,
                    }
                  }
                  today={today}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={back} disabled={step === 1}>
            <ChevronLeft aria-hidden /> Back
          </Button>
          {step < 4 ? (
            step === 2 && !values.tenantId ? null : (
              <Button type="button" size="lg" onClick={next}>
                Next: {STEPS[step]!.title} <ChevronRight aria-hidden />
              </Button>
            )
          ) : (
            <Button type="button" size="lg" disabled={pending} onClick={() => void onSubmit()}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              Save lease
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
