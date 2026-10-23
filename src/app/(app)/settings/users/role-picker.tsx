"use client";

import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/domain/auth/roles";
import { cn } from "@/lib/utils";

/** Roles as large radio cards, each with a one-line explanation. */
export function RolePicker({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: Role | undefined;
  onChange: (role: Role) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Role"
      aria-invalid={invalid || undefined}
      className="grid gap-2"
    >
      {ROLES.map((role) => {
        const checked = value === role;
        return (
          <label
            key={role}
            className={cn(
              "has-[:focus-visible]:outline-ring flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
              checked ? "border-primary bg-primary-soft/60" : "hover:bg-muted/60",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name="role"
              value={role}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(role)}
              className="mt-1 size-4.5 accent-[var(--primary)]"
            />
            <span>
              <span className="block font-medium">{ROLE_LABELS[role]}</span>
              <span className="text-muted-foreground block text-sm">{ROLE_DESCRIPTIONS[role]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
