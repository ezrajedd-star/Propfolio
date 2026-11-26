"use client";

import { CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setTicketResolvedAction, staffReplyAction } from "../../../actions";

export function StaffReplyForm({ ticketId, resolved }: { ticketId: string; resolved: boolean }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [resolve, setResolve] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await staffReplyAction(ticketId, {
            body,
            internal,
            resolve: resolve && !internal,
          });
          if (!r.ok) return setError(r.fieldErrors?.body ?? r.message);
          setBody("");
          setError(null);
          setResolve(false);
          if (internal) toast.success("Note saved (only staff see it) ✓");
          else if (r.data.emailed) toast.success("Reply sent by email ✓");
          else
            toast.warning(
              "Reply saved, but the email didn't go out. They'll see it in My requests.",
            );
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Reply or note</legend>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="radio"
            name="kind"
            className="size-5"
            checked={!internal}
            onChange={() => setInternal(false)}
          />
          Reply to the customer (emailed)
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="radio"
            name="kind"
            className="size-5"
            checked={internal}
            onChange={() => setInternal(true)}
          />
          Note for staff only
        </label>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="staffBody">{internal ? "Note" : "Reply"}</Label>
        <Textarea id="staffBody" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      {!internal ? (
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={resolve}
            onChange={(e) => setResolve(e.target.checked)}
          />
          Mark resolved with this reply
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {internal ? "Save note" : "Send reply"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setTicketResolvedAction(ticketId, !resolved);
              if (r.ok) toast.success(resolved ? "Opened again ✓" : "Marked resolved ✓");
              else toast.error(r.message);
            })
          }
        >
          {resolved ? <RotateCcw aria-hidden /> : <CheckCircle2 aria-hidden />}
          {resolved ? "Open again" : "Mark resolved without replying"}
        </Button>
      </div>
    </form>
  );
}
