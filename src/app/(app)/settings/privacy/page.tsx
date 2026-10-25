import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { FormAlert } from "@/components/form/form-alert";
import { requirePageUser } from "@/server/auth/current";
import { recordsPastRetention } from "@/server/privacy/service";
import { getSettings } from "@/server/settings/service";
import { PrivacyForm } from "./privacy-form";
import { RetentionSection } from "./retention-section";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  const actor = await requirePageUser("privacy.manage");
  const [s, retention] = await Promise.all([getSettings(), recordsPastRetention(actor)]);
  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Privacy"
        description="Data Privacy Act (RA 10173) settings: the notice tenants receive, who handles privacy requests, and how long data is kept."
      />
      {s.dpoEmail === "privacy@example.com" ? (
        <FormAlert tone="info" className="mb-6">
          Please enter your privacy officer&apos;s real name and email below. Tenants are told to
          contact them.
        </FormAlert>
      ) : null}
      <PrivacyForm
        companyName={s.companyName}
        initial={{
          privacyNotice: s.privacyNotice,
          dpoName: s.dpoName,
          dpoEmail: s.dpoEmail,
          retentionYears: s.retentionYears,
        }}
      />
      <RetentionSection years={retention.years} rows={retention.rows} />
      <p className="text-muted-foreground mt-6">
        To export, correct or anonymise one tenant&apos;s data, open the tenant and use the Privacy
        section.
      </p>
    </>
  );
}
