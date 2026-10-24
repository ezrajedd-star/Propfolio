"use client";

import { Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { Controller } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionForm } from "@/hooks/use-action-form";
import {
  PRIVACY_ACK_METHODS,
  PRIVACY_ACK_METHOD_LABELS,
  createTenantSchema,
} from "@/schemas/tenant";
import { createTenantAction } from "@/app/(app)/tenants/actions";
import { TenantFields } from "./tenant-fields";

/**
 * Add a tenant, including the privacy notice acknowledgement (RA 10173). Used on the Tenants
 * page and inside the new-lease wizard.
 */
export function NewTenantForm({
  privacyNotice,
  onCreated,
  onCancel,
  submitLabel = "Add tenant",
}: {
  privacyNotice: string;
  onCreated: (tenant: { id: string; displayName: string }) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [showNotice, setShowNotice] = useState(false);
  const { form, error, pending, onSubmit, errors } = useActionForm(
    createTenantSchema,
    {
      type: "COMPANY",
      displayName: "",
      registeredName: "",
      tin: "",
      contactPerson: "",
      phone: "",
      email: "",
      billingAddress: "",
      notes: "",
      privacyAcknowledged: false as unknown as true,
      privacyAckMethod: "SIGNED_FORM",
    },
    async (values) => {
      const r = await createTenantAction(values);
      if (r.ok) onCreated(r.data);
      return r;
    },
  );

  const printNotice = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const doc = w.document;
    doc.title = "Privacy notice";
    const pre = doc.createElement("pre");
    pre.style.cssText =
      "font: 15px/1.5 system-ui, sans-serif; white-space: pre-wrap; max-width: 46rem; margin: 2rem auto;";
    pre.textContent = privacyNotice;
    doc.body.appendChild(pre);
    w.print();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <TenantFields register={form.register} errors={errors} />

      <fieldset className="bg-primary-soft/30 space-y-4 rounded-xl border p-4">
        <legend className="px-1 font-semibold">Privacy notice</legend>
        <p>
          Under the Data Privacy Act, the tenant must receive our privacy notice before we keep
          their details.{" "}
          <button
            type="button"
            className="text-primary font-medium underline"
            onClick={() => setShowNotice((v) => !v)}
          >
            {showNotice ? "Hide the notice" : "Read the notice"}
          </button>
        </p>
        {showNotice ? (
          <div className="bg-card max-h-72 overflow-y-auto rounded-lg border p-4 text-sm whitespace-pre-wrap">
            {privacyNotice}
          </div>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={printNotice}>
          <Printer aria-hidden /> Print the notice
        </Button>
        <div className="flex items-start gap-3">
          <Controller
            control={form.control}
            name="privacyAcknowledged"
            render={({ field }) => (
              <Checkbox
                id="privacyAcknowledged"
                className="mt-0.5"
                checked={field.value === true}
                onCheckedChange={(v) => field.onChange(v === true)}
                aria-invalid={errors.privacyAcknowledged ? true : undefined}
              />
            )}
          />
          <Label htmlFor="privacyAcknowledged" className="font-normal">
            The tenant has received and acknowledged the privacy notice.
          </Label>
        </div>
        {errors.privacyAcknowledged ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {errors.privacyAcknowledged.message}
          </p>
        ) : null}
        <div className="max-w-sm space-y-2">
          <Label htmlFor="privacyAckMethod">How they received it</Label>
          <NativeSelect id="privacyAckMethod" {...form.register("privacyAckMethod")}>
            {PRIVACY_ACK_METHODS.map((m) => (
              <option key={m} value={m}>
                {PRIVACY_ACK_METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
