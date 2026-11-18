"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { reopenAccountAction } from "./actions";

export function ReopenForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div role="status" className="space-y-4">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="text-success size-6" aria-hidden /> Your account is open again.
        </p>
        <p className="text-muted-foreground">Everything is as it was. Sign in to carry on.</p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await reopenAccountAction(token);
            if (r.ok) setDone(true);
            else setError(r.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Reopen my account
      </Button>
    </div>
  );
}
