import { z } from "zod";

import { optionalText, requiredText } from "./common-fields";

export const TENANT_TYPES = ["COMPANY", "INDIVIDUAL"] as const;
export const TENANT_TYPE_LABELS = { COMPANY: "Company", INDIVIDUAL: "Individual" } as const;

export const PRIVACY_ACK_METHODS = ["SIGNED_FORM", "EMAIL", "IN_PERSON"] as const;
export const PRIVACY_ACK_METHOD_LABELS = {
  SIGNED_FORM: "Signed a printed copy",
  EMAIL: "Acknowledged by email",
  IN_PERSON: "Explained in person",
} as const;

/** Philippine TIN: 9 digits plus an optional 3–5 digit branch code. Dashes and spaces are allowed. */
const tinSchema = optionalText(25, "The TIN")
  .refine((v) => v === null || /^\d{9}(\d{3,5})?$/.test(v.replace(/[-\s]/g, "")), {
    message: "Enter the TIN as 9 digits plus the branch code, like 123-456-789-000.",
  })
  .transform((v) => {
    if (v === null) return null;
    const d = v.replace(/[-\s]/g, "");
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join("-");
  });

const emailOrNull = optionalText(254, "The email").refine(
  (v) => v === null || z.email().safeParse(v).success,
  {
    message: "Enter a valid email address, like name@company.com.",
  },
);

const phoneOrNull = optionalText(40, "The phone number").refine(
  (v) => v === null || /^[+\d][\d\s()-]{5,}$/.test(v),
  {
    message: "Enter a phone number, like 0917 123 4567 or (02) 8123 4567.",
  },
);

export const tenantFields = {
  type: z.enum(TENANT_TYPES, { error: "Choose Company or Individual." }),
  displayName: requiredText(160, "Enter the tenant's name."),
  registeredName: optionalText(200, "The registered name"),
  tin: tinSchema,
  contactPerson: optionalText(120, "The contact person"),
  phone: phoneOrNull,
  email: emailOrNull,
  billingAddress: optionalText(400, "The address"),
  notes: optionalText(2000, "The note"),
};

export const updateTenantSchema = z.object(tenantFields);

/** New tenants must acknowledge the privacy notice (RA 10173). */
export const createTenantSchema = z.object({
  ...tenantFields,
  privacyAcknowledged: z.literal(true, {
    error: "Please confirm the tenant has received the privacy notice.",
  }),
  privacyAckMethod: z.enum(PRIVACY_ACK_METHODS, {
    error: "Choose how the tenant received the notice.",
  }),
});
export type CreateTenantInput = z.input<typeof createTenantSchema>;
