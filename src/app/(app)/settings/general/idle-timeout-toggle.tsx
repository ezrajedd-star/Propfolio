"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveSettingsAction } from "../property-actions";

/** For shared office computers: Owners and Admins time out after 30 idle minutes regardless. */
export function IdleTimeoutToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-start gap-3">
      <Switch
        id="admin-idle-timeout"
        checked={on}
        disabled={pending}
        onCheckedChange={(v) =>
          startTransition(async () => {
            setOn(v);
            const r = await saveSettingsAction({ adminIdleTimeout: v });
            if (r.ok) toast.success("Saved ✓");
            else {
              setOn(!v);
              toast.error(r.message);
            }
          })
        }
      />
      <Label htmlFor="admin-idle-timeout" className="block font-normal">
        <span className="block font-medium">
          Sign Owners and Admins out after 30 minutes without activity
        </span>
        <span className="text-muted-foreground block text-sm">
          Even when they ticked &ldquo;Keep me signed in&rdquo;. Recommended on shared office
          computers. Everyone else who ticks it stays signed in for up to 30 days.
        </span>
      </Label>
    </div>
  );
}
