"use client";

import { LifeBuoy, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createTicketAction } from "@/app/(app)/requests/actions";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_LANGUAGES,
  TICKET_LANGUAGE_LABELS,
} from "@/domain/tickets/tickets";

/** "Help": ask Propfolio support, with an optional screenshot. */
export function HelpButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (form: FormData) =>
    start(async () => {
      form.set("pagePath", pathname);
      const r = await createTicketAction(form);
      if (r.ok) {
        setSent(r.data.number);
        setErrors({});
        setMessage(null);
        formRef.current?.reset();
        toast.success(`Sent. Your request is ${r.data.number} ✓`);
      } else {
        setMessage(r.message);
        setErrors(r.fieldErrors ?? {});
      }
    });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => {
          setSent(null);
          setOpen(true);
        }}
      >
        <LifeBuoy aria-hidden /> Help
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sent ? "We got your request" : "Ask Propfolio support"}</DialogTitle>
            <DialogDescription>
              {sent
                ? `Your request number is ${sent}. We'll email you when we reply, usually within one working day.`
                : "Tell us what you need. We usually reply within one working day, by email."}
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <DialogFooter>
              <Button asChild variant="outline">
                <Link href="/requests" onClick={() => setOpen(false)}>
                  See my requests
                </Link>
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          ) : (
            <form ref={formRef} action={submit} className="space-y-4" encType="multipart/form-data">
              {message ? <FormAlert>{message}</FormAlert> : null}
              <div className="space-y-2">
                <Label htmlFor="help-category">What is it about?</Label>
                <NativeSelect id="help-category" name="category" defaultValue="HOW_TO">
                  {TICKET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {TICKET_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="help-description">What happened, or what do you need?</Label>
                <Textarea
                  id="help-description"
                  name="description"
                  rows={5}
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={errors.description ? "help-description-error" : undefined}
                  placeholder="e.g. When I renew a lease, the new rent doesn't show on the calendar."
                />
                {errors.description ? (
                  <p id="help-description-error" className="text-danger text-sm">
                    {errors.description}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="help-screenshot">
                  Screenshot (optional, PNG or JPG, up to 5 MB)
                </Label>
                <input
                  id="help-screenshot"
                  name="screenshot"
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  className="block min-h-10 w-full text-base"
                  aria-invalid={errors.screenshot ? true : undefined}
                  aria-describedby={errors.screenshot ? "help-screenshot-error" : undefined}
                />
                {errors.screenshot ? (
                  <p id="help-screenshot-error" className="text-danger text-sm">
                    {errors.screenshot}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="help-language">Reply to me in</Label>
                <NativeSelect id="help-language" name="language" defaultValue="EN">
                  {TICKET_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {TICKET_LANGUAGE_LABELS[l]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <p className="text-muted-foreground text-sm">
                Please don&apos;t include tenants&apos; ID numbers or bank details.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Send
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
