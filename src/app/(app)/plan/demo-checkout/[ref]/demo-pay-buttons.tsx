"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { payDemoAction } from "../../actions";

const CHOICES = [
  { outcome: "card", label: "Pay with a test card", variant: "default" as const },
  { outcome: "gcash", label: "Pay with GCash (test)", variant: "outline" as const },
  { outcome: "maya", label: "Pay with Maya (test)", variant: "outline" as const },
  {
    outcome: "card-renewals-fail",
    label: "Pay with a test card whose next renewal fails",
    variant: "outline" as const,
  },
  { outcome: "fail", label: "Make this payment fail", variant: "outline" as const },
];

export function DemoPayButtons({ reference }: { reference: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {CHOICES.map((c) => (
        <Button
          key={c.outcome}
          variant={c.variant}
          className="w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              // On success the action goes back to the plan page.
              const r = await payDemoAction(reference, c.outcome);
              if (r && !r.ok) toast.error(r.message);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {c.label}
        </Button>
      ))}
      <p className="text-center">
        <Link href="/plan" className="text-primary underline-offset-4 hover:underline">
          Cancel and go back
        </Link>
      </p>
    </div>
  );
}
