import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { platformCan } from "@/domain/platform/roles";
import { requirePlatformPage } from "@/server/platform/current";
import { SignUpLookup } from "./signup-lookup";

export const metadata: Metadata = { title: "Sign-ups waiting for a code" };

export default async function SignUpsPage() {
  const admin = await requirePlatformPage("accounts.view", { action: "console.signups_viewed" });
  return (
    <>
      <BackLink href="/platform/accounts">All accounts</BackLink>
      <PageHeader
        title="Sign-ups waiting for a code"
        description="Someone started signing up but can't find their code email. Find their sign-up by email and send a new code."
      />
      <SignUpLookup canResend={platformCan(admin.role, "accounts.support")} />
    </>
  );
}
