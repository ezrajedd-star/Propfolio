"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cancelSubscriptionAction, choosePlanAction } from "./actions";

/** One plan card's action: start, upgrade, pay, switch later or keep. */
export function PlanButton({
  plan,
  label,
  variant = "default",
}: {
  plan: "PRO" | "PREMIUM";
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="w-full"
      variant={variant}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await choosePlanAction(plan);
          if (!r.ok) {
            toast.error(r.message);
            return;
          }
          if (r.data.kind === "checkout") {
            window.location.assign(r.data.url);
            return;
          }
          toast.success(r.data.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {label}
    </Button>
  );
}

/** Cancel, with a clear confirmation of what happens. */
export function CancelButton({ until, plan }: { until: string; plan: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Cancel my plan</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel your {plan} plan?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing more will be charged. You keep {plan} until {until}; then your account moves to
            Free. Nothing is deleted, and you can choose a plan again at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my plan</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await cancelSubscriptionAction();
                if (r.ok) {
                  toast.success("Your plan is cancelled ✓");
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.message);
              });
            }}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Cancel my plan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
