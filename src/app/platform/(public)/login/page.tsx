import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormAlert } from "@/components/form/form-alert";
import { getPlatformAdmin } from "@/server/platform/current";
import { PlatformSignInForm } from "./platform-sign-in-form";

export const metadata: Metadata = { title: "Platform sign-in" };

const NOTICES: Record<string, { tone: "info" | "success"; text: string }> = {
  "signed-out": { tone: "info", text: "You have been signed out." },
  "setup-done": {
    tone: "success",
    text: "You're all set. Sign in with your password and a code from your authenticator app.",
  },
};

export default async function PlatformLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  if (await getPlatformAdmin()) redirect("/platform");
  const { reason } = await searchParams;
  const notice = reason ? NOTICES[reason] : undefined;
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        For Propfolio staff. You need your password and the 6-digit code from your authenticator
        app.
      </p>
      {notice ? (
        <FormAlert tone={notice.tone} className="mb-6">
          {notice.text}
        </FormAlert>
      ) : null}
      <PlatformSignInForm />
    </>
  );
}
