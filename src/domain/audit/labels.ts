/** Plain-language names for audit actions. Unknown actions fall back to the raw name. */
const LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.login_failed": "Failed sign-in",
  "auth.account_locked": "Account locked",
  "auth.password_changed": "Changed password",
  "auth.password_reset_requested": "Password link sent",
  "auth.password_reset_completed": "Reset password",
  "auth.password_reset_throttled": "Too many password link requests",
  "user.create": "Added user",
  "user.update": "Edited user",
  "user.activate": "Turned account on",
  "user.deactivate": "Turned account off",
  "user.unlock": "Unlocked account",
  "settings.update": "Changed settings",
  "building.create": "Added building",
  "building.update": "Edited building",
  "building.archive": "Archived building",
  "building.restore": "Restored building",
  "unitType.create": "Added unit type",
  "unitType.update": "Edited unit type",
  "unitType.archive": "Archived unit type",
  "unitType.restore": "Restored unit type",
  "unit.create": "Added unit",
  "unit.update": "Edited unit",
  "unit.reminders_update": "Changed unit reminders",
  "unit.archive": "Archived unit",
  "unit.restore": "Restored unit",
  "tenant.create": "Added tenant",
  "tenant.update": "Edited tenant",
  "tenant.archive": "Archived tenant",
  "tenant.restore": "Restored tenant",
  "lease.create": "Created lease",
  "lease.update": "Changed lease terms",
  "lease.renew": "Renewed lease",
  "lease.terminate": "Ended lease early",
  "lease.archive": "Archived lease",
  "lease.restore": "Restored lease",
  "lease.status_sync": "Updated lease statuses",
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action;
}

const REASONS: Record<string, string> = {
  unknown_account: "no account with that email",
  wrong_password: "wrong password",
  locked: "account was locked",
  inactive: "account is turned off",
};

export function failureReasonLabel(reason: unknown): string | null {
  return typeof reason === "string" ? (REASONS[reason] ?? reason) : null;
}
