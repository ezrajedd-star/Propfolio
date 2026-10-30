"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { Field, fieldAria } from "@/components/form/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TENANT_TYPES, TENANT_TYPE_LABELS } from "@/schemas/tenant";

type TenantValues = {
  type: string;
  displayName: string;
  registeredName?: string | null;
  tin?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  billingAddress?: string | null;
  notes?: string | null;
};

/** The tenant fields (only those listed in the brief — DPA proportionality). */
export function TenantFields<T extends TenantValues>({
  register,
  errors,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}) {
  const reg = register as unknown as UseFormRegister<TenantValues>;
  const e = errors as FieldErrors<TenantValues>;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div data-guide="tenant-type">
        <Field id="type" label="Tenant is a" required error={e.type?.message}>
          <NativeSelect {...fieldAria("type", e.type?.message)} {...reg("type")}>
            {TENANT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TENANT_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div data-guide="tenant-name">
        <Field
          id="displayName"
          label="Display name"
          required
          help="The short name everyone sees, including Property Management, e.g. “ABC Corp”."
          error={e.displayName?.message}
        >
          <Input {...fieldAria("displayName", e.displayName?.message)} {...reg("displayName")} />
        </Field>
      </div>
      <Field
        id="registeredName"
        label="Registered name"
        hint="As on SEC/DTI papers, if different."
        error={e.registeredName?.message}
      >
        <Input
          {...fieldAria("registeredName", e.registeredName?.message, true)}
          {...reg("registeredName")}
        />
      </Field>
      <Field
        id="tin"
        label="TIN"
        help="Optional. Only needed for invoicing."
        error={e.tin?.message}
      >
        <Input
          {...fieldAria("tin", e.tin?.message)}
          inputMode="numeric"
          placeholder="123-456-789-000"
          {...reg("tin")}
        />
      </Field>
      <div data-guide="tenant-contact">
        <Field id="contactPerson" label="Contact person" error={e.contactPerson?.message}>
          <Input
            {...fieldAria("contactPerson", e.contactPerson?.message)}
            autoComplete="off"
            {...reg("contactPerson")}
          />
        </Field>
      </div>
      <Field id="phone" label="Phone" error={e.phone?.message}>
        <Input
          {...fieldAria("phone", e.phone?.message)}
          type="tel"
          autoComplete="off"
          {...reg("phone")}
        />
      </Field>
      <Field id="email" label="Email" error={e.email?.message}>
        <Input
          {...fieldAria("email", e.email?.message)}
          type="email"
          autoComplete="off"
          {...reg("email")}
        />
      </Field>
      <Field id="billingAddress" label="Billing address" error={e.billingAddress?.message}>
        <Textarea
          {...fieldAria("billingAddress", e.billingAddress?.message)}
          rows={2}
          {...reg("billingAddress")}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field id="notes" label="Notes" error={e.notes?.message}>
          <Textarea {...fieldAria("notes", e.notes?.message)} rows={2} {...reg("notes")} />
        </Field>
      </div>
    </div>
  );
}
