import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { deliver } from "@/server/mail/transport";
import { reportError } from "@/server/monitoring/report-error";

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** A plain email to every active Platform Owner (reports, reminders). Never throws. */
export async function emailOwners(subject: string, body: string, link?: string): Promise<number> {
  const owners = await asSystem(() =>
    db.platformAdmin.findMany({
      where: { role: "PLATFORM_OWNER", isActive: true, totpConfirmedAt: { not: null } },
      select: { email: true },
    }),
  );
  if (owners.length === 0) return 0;
  const url = link ? `${env().APP_URL}${link}` : null;
  const text = url ? `${body}\n\n${url}` : body;
  const html = `${body
    .split(/\n{2,}/)
    .map((p) => `<p style="white-space:pre-wrap">${escapeHtml(p)}</p>`)
    .join("")}${url ? `<p><a href="${url}">Open the console</a></p>` : ""}`;
  try {
    await deliver({ to: owners.map((o) => o.email), subject, text, html }, "Propfolio console");
    return owners.length;
  } catch (err) {
    reportError(err, "owners-email");
    return 0;
  }
}
