import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormAlert } from "@/components/form/form-alert";
import { LEGAL_INFO } from "@/domain/legal/documents";
import { requirePageUser } from "@/server/auth/current";
import { getCurrentSession } from "@/server/auth/current";
import { AcceptTermsForm } from "./accept-terms-form";

export const metadata: Metadata = { title: "Updated terms" };

export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  await requirePageUser(undefined, { duringLegalAcceptance: true, duringTwoStepSetup: true });
  const { welcome } = await searchParams;
  const todo = (await getCurrentSession())?.user.legalToAccept ?? [];
  if (todo.length === 0) redirect("/");
  return (
    <>
      {welcome === "password-changed" ? (
        <FormAlert tone="success" className="mb-6">
          Your new password is saved ✓
        </FormAlert>
      ) : null}
      <h1 className="text-2xl font-semibold">We&apos;ve updated our terms</h1>
      <p className="text-muted-foreground mt-1.5 mb-4">
        Please read and accept the new version to keep using Propfolio:
      </p>
      <ul className="mb-6 list-disc space-y-1 pl-6">
        {todo.map((d) => (
          <li key={d}>
            <a
              href={LEGAL_INFO[d].path}
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium underline underline-offset-4"
            >
              {LEGAL_INFO[d].title}
            </a>
          </li>
        ))}
      </ul>
      <AcceptTermsForm />
    </>
  );
}
