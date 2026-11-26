import { requirePlatformActor } from "@/server/platform/current";
import { leadTemplate } from "@/server/pipeline/import-file";

export const dynamic = "force-dynamic";

/** The leads import template (column names and one made-up example). */
export async function GET() {
  try {
    await requirePlatformActor("pipeline.manage");
  } catch {
    return new Response(null, { status: 401 });
  }
  return new Response(new Uint8Array(await leadTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Propfolio leads template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
