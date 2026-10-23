import { z } from "zod";

import { emailSchema, newPasswordSchema } from "./common";

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(1024),
});
export type SignInInput = z.infer<typeof signInSchema>;

const confirmMatches = <T extends { newPassword: string; confirmPassword: string }>(v: T) =>
  v.newPassword === v.confirmPassword;
const confirmError = { message: "The two passwords don't match.", path: ["confirmPassword"] };

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(1024),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(confirmMatches, confirmError)
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Choose a password that is different from your current one.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine(confirmMatches, confirmError);
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
