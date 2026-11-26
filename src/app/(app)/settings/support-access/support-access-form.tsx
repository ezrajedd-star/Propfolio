"use client";

import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/platform/confirm-button";
import { Button } from "@/components/ui/button";
import {
  SUPPORT_ACCESS_DURATIONS,
  SUPPORT_ACCESS_LABELS,
  type SupportAccessDuration,
} from "@/domain/auth/support-access";
import { grantSupportAccessAction, revokeSupportAccessAction } from "./actions";

export function SupportAccessForm({ on }: { on: boolean }) {
  const [duration, setDuration] = useState<SupportAccessDuration>("24h");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">
          {on ? "Change how long, starting now" : "For how long?"}
        </legend>
        {SUPPORT_ACCESS_DURATIONS.map((d) => (
          <label
            key={d}
            className="hover:bg-muted/50 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4"
          >
            <input
              type="radio"
              name="duration"
              value={d}
              checked={duration === d}
              onChange={() => setDuration(d)}
              className="size-5"
            />
            {SUPPORT_ACCESS_LABELS[d]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await grantSupportAccessAction({ duration });
              if (r.ok) toast.success("Propfolio support access is on ✓");
              else toast.error(r.message);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
          {on ? "Update support access" : "Allow Propfolio support access"}
        </Button>
        {on ? (
          <ConfirmButton
            label="Turn off now"
            variant="destructive"
            icon={<ShieldOff aria-hidden />}
            title="Turn off Propfolio support access?"
            description="Support can't get in any more. If someone from Propfolio is in your account right now, they are signed out at once."
            confirmLabel="Turn off"
            done="Support access is off ✓"
            onConfirm={() => revokeSupportAccessAction()}
          />
        ) : null}
      </div>
    </div>
  );
}
