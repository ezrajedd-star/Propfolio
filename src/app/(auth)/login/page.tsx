import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormAlert } from "@/components/form/form-alert";
import { getCurrentSession } from "@/server/auth/current";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, { tone: "info" | "success"; text: string }> = {
  idle: {
    tone: "info",
    text: "You were signed out after 30 minutes without activity. Please sign in again.",
  },
  "signed-out": { tone: "info", text: "You have been signed out." },
  "password-reset": { tone: "success", text: "Your new password is set. Sign in with it below." },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason, next } = await searchParams;
  const session = await getCurrentSession();
  if (session) redirect(session.user.mustChangePassword ? "/change-password" : "/");
  const notice = reason ? NOTICES[reason] : undefined;

  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        Use the email and password your Admin gave you.
      </p>
      {notice ? (
        <FormAlert tone={notice.tone} className="mb-6">
          {notice.text}
        </FormAlert>
      ) : null}
      <SignInForm next={next} />
    </>
  );
}
