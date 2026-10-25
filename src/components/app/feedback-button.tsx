"use client";

import { Loader2, MessageSquarePlus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { sendFeedbackAction } from "@/app/(app)/feedback/actions";
import { FormAlert } from "@/components/form/form-alert";
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

/** "Send feedback" for testers (UAT): a note plus the page they were on. */
export function FeedbackButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await sendFeedbackAction({ message, pagePath: pathname });
      if (r.ok) {
        toast.success("Thank you! Your feedback was sent.");
        setMessage("");
        setError(null);
        setOpen(false);
      } else setError(r.fieldErrors?.message ?? r.message);
    });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
        data-guide="feedback-button"
      >
        <MessageSquarePlus aria-hidden /> Send feedback
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              What went wrong, what was confusing, or what would help? We&apos;ll see which page you
              were on. Please don&apos;t include real tenants&apos; personal details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {error ? <FormAlert>{error}</FormAlert> : null}
            <Label htmlFor="feedback-message">Your feedback</Label>
            <Textarea
              id="feedback-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. I couldn't find where to change the rent due day."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Send feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
