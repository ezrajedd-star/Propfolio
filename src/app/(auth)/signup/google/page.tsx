import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSignUpToken } from "@/server/auth/current";
import { getGoogleSignUp } from "@/server/signup/service";
import { GoogleDetailsForm } from "./google-details-form";

export const metadata: Metadata = { title: "Almost there" };

/** After "Continue with Google", for someone new: the name they lease under, and the checkbox. */
export default async function GoogleDetailsPage() {
  const token = await getSignUpToken();
  const pending = token ? await getGoogleSignUp(token) : null;
  if (!pending) redirect("/signup");
  return (
    <>
      <h1 className="text-2xl font-semibold">Almost there, {pending.name.split(/\s+/)[0]}</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        Signing up as <span className="font-medium">{pending.email}</span>. One more thing:
      </p>
      <GoogleDetailsForm />
    </>
  );
}
