"use client";

import { Ban, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { voidPaymentAction } from "../actions";

export function AcknowledgementActions({
  paymentId,
  paymentNo,
  canVoid,
}: {
  paymentId: string;
  paymentNo: string;
  canVoid: boolean;
  leaseId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      {canVoid ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Ban aria-hidden /> Void payment
        </Button>
      ) : null}
      <Button onClick={() => window.print()}>
        <Printer aria-hidden /> Print
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Void payment ${paymentNo}?`}
        description="Use this if the payment was entered by mistake or a cheque bounced. The payment stays on record, marked as voided, and the charges it paid become unpaid again."
        confirmLabel="Void payment"
        done={`Payment ${paymentNo} voided`}
        onConfirm={async (reason) => {
          const r = await voidPaymentAction(paymentId, reason);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}
