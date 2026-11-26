import { z } from "zod";

import { LEAD_SOURCES, LEAD_STAGES, LEAD_TYPES } from "@/domain/pipeline/pipeline";
import { emailSchema } from "./common";
import { isoDateSchema, requiredText } from "./common-fields";

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep it under ${max} characters.`).optional().default("");

export const leadSchema = z
  .object({
    name: requiredText(120, "Enter their name."),
    company: optionalText(160),
    type: z.enum(LEAD_TYPES, { error: "Choose a type." }),
    email: z
      .union([z.literal(""), emailSchema])
      .optional()
      .default(""),
    phone: optionalText(40),
    source: z.enum(LEAD_SOURCES, { error: "Choose where they came from." }),
    portfolioSize: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(999_999)])
      .optional()
      .default(""),
    notes: optionalText(5000),
    nextFollowUp: z
      .union([z.literal(""), isoDateSchema("Choose a date.")])
      .optional()
      .default(""),
    ownerId: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .default(""),
    marketingConsent: z.boolean().default(false),
    consentSource: optionalText(200),
  })
  .refine((v) => !v.marketingConsent || v.email !== "", {
    path: ["email"],
    message: "Marketing consent needs an email address.",
  })
  .refine((v) => !v.marketingConsent || v.consentSource !== "", {
    path: ["consentSource"],
    message: "Say where they agreed (e.g. 'Demo call on 3 Dec', 'Event sign-up sheet').",
  });

export const moveStageSchema = z
  .object({
    stage: z.enum(LEAD_STAGES, { error: "Choose a stage." }),
    lostReason: optionalText(300),
  })
  .refine((v) => v.stage !== "LOST" || v.lostReason !== "", {
    path: ["lostReason"],
    message: "Say why they were lost (e.g. 'Went with another tool', 'No budget').",
  });

export const ACTIVITY_KINDS = ["NOTE", "CALL", "EMAIL", "MESSAGE", "MEETING"] as const;

export const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS, { error: "Choose what happened." }),
  text: requiredText(2000, "Write what happened."),
});

export const discoverySchema = z.object({
  currentTool: optionalText(200),
  pains: z.tuple([optionalText(300), optionalText(300), optionalText(300)]),
  painStrength: z.union([z.null(), z.coerce.number().int().min(1).max(5)]).default(null),
  priceSuggested: optionalText(100),
  pilotInterest: z.enum(["yes", "maybe", "no", ""]).default(""),
  bestQuote: optionalText(500),
});

export const deleteLeadSchema = z.object({
  reason: requiredText(300, "Say why (e.g. 'Asked to be deleted by email on 3 Dec')."),
});
