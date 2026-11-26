"use client";

import { Loader2, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { replyToMyTicketAction } from "../actions";

export function CustomerReplyForm({ ticketId, resolved }: { ticketId: string; resolved: boolean }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await replyToMyTicketAction(ticketId, { body });
          if (r.ok) {
            setBody("");
            setError(null);
            toast.success("Sent ✓");
          } else setError(r.fieldErrors?.body ?? r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Label htmlFor="reply">
        {resolved ? "Not solved? Reply to open it again" : "Your reply"}
      </Label>
      <Textarea id="reply" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Send reply
      </Button>
    </form>
  );
}
