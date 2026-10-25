"use client";

import { BellOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { markHandledAction, unmarkHandledAction } from "@/app/(app)/leases/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Mark reminder handled": stops further expiry reminder emails for one lease. Asks for an
 * optional note, then offers Undo.
 */
export function MarkHandledButton({
  leaseId,
  tenantName,
  size = "default",
  variant = "default",
  className,
  onDone,
}: {
  leaseId: string;
  tenantName: string;
  size?: "default" | "sm";
  variant?: "default" | "outline";
  className?: string;
  onDone?: (handled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const undo = () =>
    startTransition(async () => {
      const r = await unmarkHandledAction(leaseId);
      if (!r.ok) return void toast.error(r.message);
      toast.success("Reminders turned back on");
      onDone?.(false);
      router.refresh();
    });

  const confirm = () =>
    startTransition(async () => {
      const r = await markHandledAction(leaseId, note);
      if (!r.ok) return void toast.error(r.message);
      setOpen(false);
      setNote("");
      onDone?.(true);
      toast.success(`Marked as handled ✓ No more reminders about ${tenantName}.`, {
        duration: 8000,
        action: { label: "Undo", onClick: undo },
      });
      router.refresh();
    });

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <BellOff aria-hidden /> Mark reminder handled
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark the reminder as handled?</DialogTitle>
            <DialogDescription>
              The team won&apos;t get any more expiry reminders about {tenantName}&apos;s lease. Use
              this when the renewal or move-out is already being taken care of. You can turn
              reminders back on later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`handled-note-${leaseId}`}>What was decided? (optional)</Label>
            <Textarea
              id={`handled-note-${leaseId}`}
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Tenant confirmed they will renew; contract being prepared"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Mark as handled
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ResumeRemindersButton({ leaseId }: { leaseId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await unmarkHandledAction(leaseId);
          if (!r.ok) return void toast.error(r.message);
          toast.success("Reminders turned back on");
          router.refresh();
        })
      }
    >
      Turn reminders back on
    </Button>
  );
}
