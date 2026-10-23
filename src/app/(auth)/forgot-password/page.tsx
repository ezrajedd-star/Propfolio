import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        Enter your work email. If it belongs to an account, we&apos;ll email you a link to set a new
        password.
      </p>
      <ForgotPasswordForm />
    </>
  );
}
