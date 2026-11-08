import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeso } from "@/domain/money/money";
import { PLAN_CONFIG } from "@/domain/plans/plans";
import { requirePageUser } from "@/server/auth/current";
import { getDemoCheckout } from "@/server/subscription/service";
import { DemoPayButtons } from "./demo-pay-buttons";

export const metadata: Metadata = { title: "Test payment" };

/**
 * Stands in for the payment provider's hosted checkout until PayMongo is connected. Only on the
 * test site and in development: no real money, no card details.
 */
export default async function DemoCheckoutPage({ params }: { params: Promise<{ ref: string }> }) {
  const actor = await requirePageUser("billing.manage", { duringReadOnly: true });
  const ref = decodeURIComponent((await params).ref);
  const c = await getDemoCheckout(actor, ref);
  if (!c) notFound();
  const plan = PLAN_CONFIG[c.plan as "PRO" | "PREMIUM"].label;
  return (
    <Card className="mx-auto mt-4 max-w-lg">
      <CardHeader>
        <p className="bg-warning-soft text-warning mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          Test payment: no real money moves. Online payment by card, GCash or Maya comes with
          PayMongo.
        </p>
        <CardTitle>
          {c.kind === "UPGRADE" ? `Upgrade to ${plan}` : `Propfolio ${plan}, one month`}
        </CardTitle>
        <p className="text-3xl font-semibold tabular-nums">{formatPeso(c.amount)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {c.status === "OPEN" ? (
          <DemoPayButtons reference={ref} />
        ) : (
          <p>
            This payment is already {c.status.toLowerCase()}.{" "}
            <Link href="/plan" className="text-primary underline underline-offset-4">
              Back to your plan
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
