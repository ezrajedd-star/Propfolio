import { z } from "zod";

import { ASSIGNABLE_ROLES } from "@/domain/auth/roles";
import { emailSchema, nameSchema } from "./common";

export const roleSchema = z.enum(ASSIGNABLE_ROLES, { error: "Choose a role." });

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  role: roleSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Invite someone to the team by email, with a role (they set up their own sign-in). */
export const inviteSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});
export type InviteInput = z.infer<typeof inviteSchema>;

/** Accepting an invitation as someone new: the email comes from the invitation itself. */
export const acceptInvitationSchema = z.object({
  name: nameSchema,
  password: z.string().max(1024),
  acceptLegal: z.literal(true, {
    error: "Please accept the Terms of Service, Privacy Policy and Data Processing Agreement.",
  }),
});
export type AcceptInvitationInput = z.input<typeof acceptInvitationSchema>;
