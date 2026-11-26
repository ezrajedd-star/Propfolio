import { z } from "zod";

import { TICKET_CATEGORIES, TICKET_LANGUAGES } from "@/domain/tickets/tickets";

const body = (min: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(min, message)
    .max(5000, "Please keep it under 5,000 characters.");

export const newTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES, { error: "Choose what it's about." }),
  language: z.enum(TICKET_LANGUAGES).default("EN"),
  description: body(10, "Tell us a little more (at least 10 characters)."),
  /** The page they were on (path only). */
  pagePath: z
    .string()
    .max(200)
    .regex(/^\/[\w\-/]*$/)
    .optional()
    .catch(undefined),
});

export const ticketReplySchema = z.object({ body: body(1, "Write a reply.") });

export const staffReplySchema = z.object({
  body: body(1, "Write a reply."),
  /** A note only staff see. */
  internal: z.boolean().default(false),
  /** Mark resolved with this reply. */
  resolve: z.boolean().default(false),
});
