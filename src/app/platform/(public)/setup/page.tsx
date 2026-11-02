import type { Metadata } from "next";
import Link from "next/link";

import { FormAlert } from "@/components/form/form-alert";
import { getPlatformSetup } from "@/server/platform/auth";
import { PlatformSetupForm } from "./platform-setup-form";

export const metadata: Metadata = { title: "Set up platform sign-in" };

export default async function PlatformSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const setup = token && token.length <= 200 ? await getPlatformSetup(token) : null;
  if (!token || !setup) {
    return (
      <>
        <h1 className="text-2xl font-semibold">This link doesn&apos;t work</h1>
        <FormAlert className="mt-6">
          It has expired or was already used. Set-up links work once, for 24 hours. Ask for a new
          one to be made on the server.
        </FormAlert>
        <p className="mt-6">
          <Link
            href="/platform/login"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Go to sign-in
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome, {setup.name}</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        Two steps keep customers&apos; accounts safe: a password only you know, and a code from an
        authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator
        or 1Password).
      </p>
      <PlatformSetupForm
        token={token}
        email={setup.email}
        secret={setup.secret}
        qrSvg={setup.qrSvg}
      />
    </>
  );
}
