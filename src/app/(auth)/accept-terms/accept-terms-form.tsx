"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { LegalCheckbox } from "@/components/auth/legal-checkbox";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { acceptTermsAction } from "./actions";

export function AcceptTermsForm() {
  const [pending, start] = useTransition();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await acceptTermsAction({ acceptLegal: accepted });
          if (r && !r.ok) setError(r.fieldErrors?.acceptLegal ?? r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <LegalCheckbox checked={accepted} onChange={setAccepted} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Accept and continue
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => start(() => signOutAction())}
      >
        Not now: sign out
      </Button>
    </form>
  );
}
