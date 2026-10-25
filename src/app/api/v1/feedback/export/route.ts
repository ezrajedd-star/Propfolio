import { toCsv } from "@/domain/export/csv";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { formatDateTime, manilaToday } from "@/domain/time/manila";
import { writeAudit } from "@/server/audit";
import { requireActor } from "@/server/auth/current";
import { listFeedback } from "@/server/feedback/service";
import { apiRoute } from "@/server/http";
import { metaFromHeaders } from "@/server/request-meta";

export const dynamic = "force-dynamic";

/** All tester feedback as CSV (opens in Excel). */
export const GET = apiRoute(async (req) => {
  const actor = await requireActor("settings.manage");
  const rows = await listFeedback(actor, { includeDone: true });
  const csv = toCsv(
    ["Sent", "From", "Role", "Page", "Feedback", "Status"],
    rows.map((f) => [
      formatDateTime(f.createdAt),
      f.userName,
      ROLE_LABELS[f.role],
      f.pagePath,
      f.message,
      f.status === "DONE" ? "Done" : "To do",
    ]),
  );
  await writeAudit({
    actor,
    action: "data.export",
    entityType: "Feedback",
    metadata: { format: "csv", rows: rows.length },
    meta: metaFromHeaders(req.headers),
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="propfolio-feedback-${manilaToday()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
