"use client";

import { BellRing, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { requestRestartAction, resolveIncidentAction, sendTestAlertAction } from "../../actions";

export function ResolveIncidentButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <CheckCircle2 aria-hidden /> Mark resolved
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Mark "${title}" as resolved?`}
        description="Say in a few words what was done. It goes in the staff log."
        confirmLabel="Mark resolved"
        done="Marked resolved ✓"
        placeholder="e.g. Restarted the web app; checks are green again"
        onConfirm={(reason) => resolveIncidentAction(id, { note: reason })}
      />
    </>
  );
}

export function TestAlertButton({ configured }: { configured: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending || !configured}
      onClick={() =>
        start(async () => {
          const r = await sendTestAlertAction();
          if (!r.ok) toast.error(r.message);
          else if (r.data.sent > 0)
            toast.success(
              `Test alert sent to ${r.data.sent} phone${r.data.sent === 1 ? "" : "s"} ✓`,
            );
          else toast.error("The alert didn't go out. Check the Pushover keys on the server.");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <BellRing aria-hidden />}
      Send a test alert
    </Button>
  );
}

export function RestartButton({
  kind,
  label,
  disabled,
}: {
  kind: "RESTART_WEB" | "RESTART_WORKER";
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <RotateCw aria-hidden /> {label}
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`${label}?`}
        description="The server does it within a minute. People using Propfolio may see a short pause. Your data is not affected. Say why; it goes in the staff log."
        confirmLabel={label}
        done="Asked the server ✓ It will restart within a minute."
        placeholder="e.g. The site isn't loading (Better Stack alert)"
        onConfirm={(reason) => requestRestartAction(kind, { reason })}
      />
    </>
  );
}
