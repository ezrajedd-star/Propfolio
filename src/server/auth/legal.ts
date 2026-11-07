import { LEGAL_INFO, documentsToAccept } from "@/domain/legal/documents";
import { acceptLegalUpdateSchema } from "@/schemas/signup";
import { writeAudit } from "@/server/audit";
import { asSystem, db } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import type { Actor } from "./authorize";

/** A person accepts the current versions of the documents they hadn't accepted yet. */
export async function acceptLegalUpdates(
  actor: Pick<Actor, "id" | "name" | "role" | "accountId">,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<void> {
  parseInput(acceptLegalUpdateSchema, input);
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const accepted = await tx.legalAcceptance.findMany({
        where: { userId: actor.id },
        select: { document: true, version: true },
      });
      const todo = documentsToAccept(accepted);
      if (todo.length === 0) return;
      await tx.legalAcceptance.createMany({
        data: todo.map((document) => ({
          userId: actor.id,
          document,
          version: LEGAL_INFO[document].version,
          acceptedAt: now,
          ipAddress: meta.ipAddress,
        })),
        skipDuplicates: true,
      });
      await writeAudit(
        {
          actor,
          action: "legal.accepted",
          entityType: "User",
          entityId: actor.id,
          metadata: {
            documents: todo.map((d) => ({ document: d, version: LEGAL_INFO[d].version })),
          },
          meta,
          accountId: actor.accountId,
        },
        tx,
      );
    }),
  );
}
