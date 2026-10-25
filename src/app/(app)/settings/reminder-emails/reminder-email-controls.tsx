"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveSettingsAction } from "../property-actions";
import { retryDigestAction } from "./actions";

const MESSAGES: Record<string, string> = {
  SENT: "Today's reminder email was sent ✓",
  EMPTY: "Nothing needs attention today, so no email was sent.",
  ALREADY_DONE: "Today's reminder email was already sent.",
  IN_PROGRESS: "It's being sent right now. Check again in a minute.",
};

export function RetryButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await retryDigestAction();
          if (!r.ok) return void toast.error(r.message);
          if (r.data.status === "FAILED")
            toast.error(
              "It still couldn't be sent. See the error below, or ask your IT administrator to check the email settings.",
            );
          else toast.success(MESSAGES[r.data.status] ?? "Done");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCw aria-hidden />}
      Try sending today&apos;s email again
    </Button>
  );
}

export function OverdueToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-start gap-3">
      <Switch
        id="digest-overdue"
        checked={on}
        disabled={pending}
        onCheckedChange={(v) =>
          startTransition(async () => {
            setOn(v);
            const r = await saveSettingsAction({ digestIncludeOverdue: v });
            if (r.ok) toast.success("Saved ✓");
            else {
              setOn(!v);
              toast.error(r.message);
            }
          })
        }
      />
      <Label htmlFor="digest-overdue" className="block font-normal">
        <span className="block font-medium">
          Include a short &ldquo;overdue payments&rdquo; section
        </span>
        <span className="text-muted-foreground block text-sm">
          Shows the number and total of overdue payments, with a link. Starts working once payments
          are added.
        </span>
      </Label>
    </div>
  );
}
