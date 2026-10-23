import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/server/env";

export interface OutgoingMail {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Messages "sent" with MAIL_TRANSPORT=log. Tests read this; nothing is printed with PII. */
export const logOutbox: OutgoingMail[] = [];

let transporter: Transporter | undefined;

function smtp(): Transporter {
  const e = env();
  transporter ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export async function deliver(mail: OutgoingMail, fromName?: string): Promise<void> {
  const e = env();
  if (e.MAIL_TRANSPORT === "log") {
    logOutbox.push(mail);
    // Recipient addresses and bodies are personal data / secrets: log only counts.
    console.info(`[mail:log] "${mail.subject}" → ${mail.to.length} recipient(s)`);
    return;
  }
  const from = fromName ? withName(e.MAIL_FROM, fromName) : e.MAIL_FROM;
  await smtp().sendMail({ from, ...mail });
}

/** Replace the display name of an address like `Name <a@b.c>`. */
function withName(address: string, name: string): string {
  const m = /<([^>]+)>/.exec(address);
  const bare = m?.[1] ?? address;
  return `"${name.replace(/"/g, "")}" <${bare}>`;
}
