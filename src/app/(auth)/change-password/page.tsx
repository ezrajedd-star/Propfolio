import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/current";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const firstTime = session.user.mustChangePassword;

  return (
    <>
      <h1 className="text-2xl font-semibold">
        {firstTime ? `Welcome, ${session.user.name}` : "Change your password"}
      </h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        {firstTime
          ? "Before you start, please replace the temporary password you were given with one only you know."
          : "Enter your current password, then choose a new one."}
      </p>
      <ChangePasswordForm firstTime={firstTime} />
      {!firstTime ? (
        <p className="mt-5 text-center">
          <Link
            href="/account"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Cancel
          </Link>
        </p>
      ) : null}
    </>
  );
}
