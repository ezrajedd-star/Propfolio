"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LEGAL_DOCUMENTS, LEGAL_INFO } from "@/domain/legal/documents";

/** "I accept the Terms of Service, Privacy Policy and Data Processing Agreement" (links open a new tab). */
export function LegalCheckbox({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  const links = LEGAL_DOCUMENTS.map((d) => (
    <a
      key={d}
      href={LEGAL_INFO[d].path}
      target="_blank"
      rel="noreferrer"
      className="text-primary font-medium underline underline-offset-4"
    >
      {LEGAL_INFO[d].title}
    </a>
  ));
  return (
    <div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="acceptLegal"
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "acceptLegal-error" : undefined}
          className="mt-1"
        />
        <Label htmlFor="acceptLegal" className="block font-normal">
          I accept the {links[0]}, the {links[1]} and the {links[2]}.
        </Label>
      </div>
      {error ? (
        <p id="acceptLegal-error" className="text-danger mt-1.5 text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
