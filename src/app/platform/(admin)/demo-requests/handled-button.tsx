"use client";

import { Check, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setDemoRequestHandledAction } from "../../actions";

export function HandledButton({ id, handled }: { id: string; handled: boolean }) {
  const [pending, start] = useTransition();
  const set = (to: boolean) =>
    start(async () => {
      const r = await setDemoRequestHandledAction(id, to);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      if (to) {
        toast.success("Marked as handled.", {
          action: { label: "Undo", onClick: () => set(false) },
        });
      }
    });
  return handled ? (
    <Button variant="outline" disabled={pending} onClick={() => set(false)}>
      <Undo2 aria-hidden /> Reopen
    </Button>
  ) : (
    <Button disabled={pending} onClick={() => set(true)}>
      <Check aria-hidden /> Mark as handled
    </Button>
  );
}
