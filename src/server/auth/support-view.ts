import { headers } from "next/headers";

import { writeAudit } from "@/server/audit";
import { asSystem, db } from "@/server/db";
import { writeStaffLog } from "@/server/platform/staff-log";
import { metaFromHeaders } from "@/server/request-meta";
import type { ValidSession } from "./session";

/**
 * Every page Propfolio support opens in a customer's app goes in that account's audit log and
 * in the staff log, with the page's address. Changes are audited by the services as usual.
 */
export async function logSupportView(session: ValidSession): Promise<void> {
  if (!session.support) return;
  const h = await headers();
  const path = (h.get("x-pathname") ?? "").slice(0, 200) || null;
  const meta = metaFromHeaders(h);
  const { adminId, adminName, grantId } = session.support;
  await asSystem(async () => {
    const admin = await db.platformAdmin.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    if (admin) {
      await writeStaffLog({
        actor: { id: adminId, name: adminName, role: admin.role },
        kind: "VIEW",
        action: "support.page_viewed",
        accountId: session.accountId,
        metadata: { path, grantId },
        meta,
      });
    }
    await writeAudit({
      actor: { id: session.user.id, name: session.user.name, role: null },
      action: "support.page_viewed",
      entityType: "Page",
      metadata: { platform: true, support: true, path, grantId },
      meta,
      accountId: session.accountId,
    });
  });
}
