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
    // Give up quickly when the mail server can't be reached (e.g. a blocked port), so a page
    // waiting on an email shows a message instead of spinning for minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
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
  const to = e.MAIL_SKIP_TEST_DOMAINS ? mail.to.filter((a) => !isReservedAddress(a)) : mail.to;
  if (to.length === 0) {
    console.info(`[mail] "${mail.subject}" skipped: only demo (.test) recipients`);
    return;
  }
  const from = fromName ? withName(e.MAIL_FROM, fromName) : e.MAIL_FROM;
  try {
    await smtp().sendMail({ from, ...mail, to });
  } catch (err) {
    throw new MailDeliveryError(err);
  }
}

/**
 * Sending failed. The name carries the mail server's codes only (e.g. "MailDeliveryError
 * EAUTH 535"), which say what went wrong without any address or message text, so the log is
 * useful and still holds no personal data.
 */
export class MailDeliveryError extends Error {
  constructor(cause: unknown) {
    const c = cause as { code?: unknown; responseCode?: unknown };
    const code = typeof c?.code === "string" ? c.code.replace(/[^A-Z0-9_]/g, "") : "";
    const status = typeof c?.responseCode === "number" ? String(c.responseCode) : "";
    super("The email could not be sent.");
    this.name = ["MailDeliveryError", code, status].filter(Boolean).join(" ");
  }
}

/**
 * Addresses on domains reserved for testing (RFC 2606/6761), like the demo accounts'
 * `@propfolio.test`. They can never receive mail; sending to them hurts the sender's reputation.
 */
export function isReservedAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@").pop() ?? "";
  return (
    /(^|\.)(test|example|invalid|localhost)$/.test(domain) ||
    /(^|\.)example\.(com|net|org)$/.test(domain)
  );
}

/** Replace the display name of an address like `Name <a@b.c>`. */
function withName(address: string, name: string): string {
  const m = /<([^>]+)>/.exec(address);
  const bare = m?.[1] ?? address;
  return `"${name.replace(/"/g, "")}" <${bare}>`;
}
