import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { HelpTip } from "@/components/app/help-tip";
import { Label } from "@/components/ui/label";

/**
 * A labelled form field with a clear "Required" marker, optional help text, and an error
 * message shown right next to the field in plain language.
 */
export function Field({
  id,
  label,
  required,
  help,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {required ? <span className="text-muted-foreground text-sm">(required)</span> : null}
        {help ? <HelpTip label={`About ${label}`}>{help}</HelpTip> : null}
      </div>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-sm font-medium"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria props to wire an input to its Field's hint/error text. */
export function fieldAria(id: string, error?: string, hasHint?: boolean) {
  const describedBy = error ? `${id}-error` : hasHint ? `${id}-hint` : undefined;
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };
}
