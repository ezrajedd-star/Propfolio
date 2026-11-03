import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TRUSTED_DEVICE_DAYS } from "@/domain/auth/two-step";
import { getPendingSignInToken } from "@/server/auth/current";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default async function SignInCodePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!(await getPendingSignInToken())) redirect("/login");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold">Type your code</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        Open your authenticator app and type the 6-digit code shown for Propfolio. Lost your phone?
        Use one of your recovery codes instead.
      </p>
      <CodeForm next={next} rememberDays={TRUSTED_DEVICE_DAYS} />
      <p className="mt-6 text-center">
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Start again
        </Link>
      </p>
    </>
  );
}
