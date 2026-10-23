import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/domain/auth/roles";
import { formatDateTime } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const actor = await requirePageUser();
  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { passwordChangedAt: true, lastLoginAt: true },
  });

  const rows: [string, React.ReactNode][] = [
    ["Name", actor.name],
    ["Email", actor.email],
    [
      "Role",
      <>
        <span className="font-medium">{ROLE_LABELS[actor.role]}</span>
        <span className="text-muted-foreground block text-sm">{ROLE_DESCRIPTIONS[actor.role]}</span>
      </>,
    ],
    ["Last signed in", formatDateTime(user.lastLoginAt)],
    [
      "Password last changed",
      user.passwordChangedAt ? formatDateTime(user.passwordChangedAt) : "Not yet",
    ],
  ];

  return (
    <>
      <PageHeader
        title="My account"
        description="To change your name, email or role, ask an Admin."
        actions={
          <Button asChild>
            <Link href="/change-password">
              <KeyRound aria-hidden /> Change password
            </Link>
          </Button>
        }
      />
      <Card className="max-w-2xl">
        <CardContent>
          <dl className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="sm:col-span-2">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
