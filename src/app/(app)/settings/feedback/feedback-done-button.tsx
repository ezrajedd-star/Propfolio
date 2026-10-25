"use client";

import { Check, RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setFeedbackDoneAction } from "../../feedback/actions";

export function FeedbackDoneButton({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setFeedbackDoneAction(id, !done);
          if (!r.ok) toast.error(r.message);
        })
      }
    >
      {done ? <RotateCcw aria-hidden /> : <Check aria-hidden />}
      {done ? "Mark as not done" : "Mark as done"}
    </Button>
  );
}
