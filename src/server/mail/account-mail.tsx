import { render } from "@react-email/render";
import type { ReactElement } from "react";

import { formatDateTime } from "@/domain/time/manila";
import { getSettings } from "@/server/settings/service";
import { deliver } from "./transport";
import {
  EmailChangedEmail,
  PasswordChangedEmail,
  PasswordResetEmail,
} from "./templates/account-emails";

async function send(to: string[], subject: string, element: ReactElement): Promise<boolean> {
  const settings = await getSettings();
  try {
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await deliver(
      { to, subject, html, text, replyTo: settings.mailReplyTo || undefined },
      settings.mailFromName,
    );
    return true;
  } catch (err) {
    // No addresses in logs.
    console.error(`[mail] failed to send "${subject}":`, (err as Error).message);
    return false;
  }
}

export async function sendPasswordResetEmail(
  user: { name: string; email: string },
  url: string,
  validMinutes: number,
): Promise<boolean> {
  const { companyName } = await getSettings();
  return send(
    [user.email],
    "Set a new Propfolio password",
    <PasswordResetEmail
      companyName={companyName}
      name={user.name}
      url={url}
      validMinutes={validMinutes}
    />,
  );
}

export async function sendPasswordChangedEmail(user: { name: string; email: string }, at: Date) {
  const { companyName } = await getSettings();
  return send(
    [user.email],
    "Your Propfolio password was changed",
    <PasswordChangedEmail companyName={companyName} name={user.name} when={formatDateTime(at)} />,
  );
}

/** Sent to both the old and new address. */
export async function sendEmailChangedEmail(
  user: { name: string; oldEmail: string; newEmail: string },
  at: Date,
) {
  const { companyName } = await getSettings();
  return send(
    [user.oldEmail, user.newEmail],
    "Your Propfolio email address was changed",
    <EmailChangedEmail
      companyName={companyName}
      name={user.name}
      newEmail={user.newEmail}
      when={formatDateTime(at)}
    />,
  );
}
