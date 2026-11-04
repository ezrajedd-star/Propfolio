import { Gem, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FEATURES,
  FEATURE_DESCRIPTIONS,
  FEATURE_LABELS,
  FEATURE_PLAN,
  PLAN_CONFIG,
  READ_ONLY_MESSAGE,
  type Feature,
} from "@/domain/plans/plans";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Upgrade to use this" };

/** Where the server sends people who open something their plan doesn't include. */
export default async function LockedPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string; reason?: string }>;
}) {
  await requirePageUser();
  const { feature: raw, reason } = await searchParams;
  const feature = FEATURES.find((f) => f === raw) as Feature | undefined;
  const readOnly = reason === "read-only" || !feature;

  const title = readOnly
    ? "Your account is read-only for now"
    : `${FEATURE_LABELS[feature]}: available on ${PLAN_CONFIG[FEATURE_PLAN[feature]].label}`;
  const text = readOnly ? READ_ONLY_MESSAGE : FEATURE_DESCRIPTIONS[feature];

  return (
    <Card className="mx-auto mt-6 max-w-xl">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="bg-primary-soft text-primary flex size-14 items-center justify-center rounded-full">
          <Lock className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground max-w-md">{text}</p>
        <Button asChild size="lg">
          <Link href="/plan">
            <Gem aria-hidden /> {readOnly ? "See your options" : "Upgrade"}
          </Link>
        </Button>
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          Back to Home
        </Link>
      </CardContent>
    </Card>
  );
}
