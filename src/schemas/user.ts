import { z } from "zod";

import { ROLES } from "@/domain/auth/roles";
import { emailSchema, nameSchema } from "./common";

export const roleSchema = z.enum(ROLES, { error: "Choose a role." });

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
