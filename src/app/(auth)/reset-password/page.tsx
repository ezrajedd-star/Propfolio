import type { Metadata } from "next";
import Link from "next/link";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { checkResetToken } from "@/server/auth/passwords";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token && token.length <= 200 && (await checkResetToken(token)) === "valid";

  if (!valid) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">This link no longer works</h1>
        <FormAlert>
          Password links work for 60 minutes and only once. Ask for a new link, and use the newest
          email.
        </FormAlert>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Email me a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        Choose a password you don&apos;t use anywhere else.
      </p>
      <ResetPasswordForm token={token} />
    </>
  );
}
