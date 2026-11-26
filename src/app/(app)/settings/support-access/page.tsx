import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDateTime } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { getSupportAccess } from "@/server/support-access/service";
import { SupportAccessForm } from "./support-access-form";

export const metadata: Metadata = { title: "Propfolio support access" };

export default async function SupportAccessPage() {
  const actor = await requirePageUser("settings.manage", { duringReadOnly: true });
  const access = await getSupportAccess(actor);
  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Propfolio support access"
        description="If you've asked us for help, you can let our support team into your account for a while, so we can see what you see."
      />
      <Card className="max-w-2xl">
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            {access ? (
              <>
                <StatusBadge tone="warning" label="On" />
                <span>
                  Until {formatDateTime(access.expiresAt)}, turned on by {access.grantedByName}.
                </span>
              </>
            ) : (
              <>
                <StatusBadge tone="neutral" label="Off" />
                <span>Propfolio support can&apos;t get into your account.</span>
              </>
            )}
          </div>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            <li>Support uses the same screens you do. There is no back door.</li>
            <li>
              Support can&apos;t change your users or their access, your plan or billing, and
              can&apos;t export, anonymise or delete data.
            </li>
            <li>Every page support opens and every change is in your audit log.</li>
            <li>It turns off by itself at the end, and you can turn it off at any time.</li>
            <li>Everyone in your account sees a banner while it is on.</li>
          </ul>
          {actor.support ? (
            <p className="font-medium">Only the account&apos;s own people can change this.</p>
          ) : (
            <SupportAccessForm on={access !== null} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
