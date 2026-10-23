"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { PASSWORD_MIN_LENGTH } from "@/domain/auth/password-policy";
import { Field, fieldAria } from "./field";
import { PasswordInput } from "./password-input";

type Values = { newPassword: string; confirmPassword: string };

export function NewPasswordFields<T extends Values>({
  register,
  errors,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}) {
  const reg = register as unknown as UseFormRegister<Values>;
  const errs = errors as FieldErrors<Values>;
  const hint = `At least ${PASSWORD_MIN_LENGTH} characters. A short sentence you'll remember works well, like “blue mango by the river”.`;
  return (
    <>
      <Field
        id="newPassword"
        label="New password"
        required
        hint={hint}
        error={errs.newPassword?.message}
      >
        <PasswordInput
          {...fieldAria("newPassword", errs.newPassword?.message, true)}
          autoComplete="new-password"
          {...reg("newPassword")}
        />
      </Field>
      <Field
        id="confirmPassword"
        label="Type the new password again"
        required
        error={errs.confirmPassword?.message}
      >
        <PasswordInput
          {...fieldAria("confirmPassword", errs.confirmPassword?.message)}
          autoComplete="new-password"
          {...reg("confirmPassword")}
        />
      </Field>
    </>
  );
}
