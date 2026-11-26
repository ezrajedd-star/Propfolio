import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { platformCan } from "@/domain/platform/roles";
import { formatDateTime } from "@/domain/time/manila";
import { getApproval } from "@/server/agents/approvals";
import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";
import { requirePlatformPage } from "@/server/platform/current";
import { DecideApproval } from "./decide";

export const metadata: Metadata = { title: "Approval" };

const STATUS = {
  PENDING: { tone: "warning", label: "Waiting" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "neutral", label: "Rejected" },
  FAILED: { tone: "danger", label: "Approved, but it failed" },
  TOLD: { tone: "default", label: "Done by the agent" },
} as const;

const LINKS: Record<string, (id: string) => string> = {
  Ticket: (id) => `/platform/tickets/${id}`,
  Lead: (id) => `/platform/pipeline/${id}`,
};

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = await requirePlatformPage("approvals.view", {
    action: "console.approval_viewed",
    entityType: "Approval",
    entityId: id,
  });
  const a = await getApproval(admin, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const s = STATUS[a.status];
  return (
    <>
      <BackLink href="/platform/approvals">Approvals</BackLink>
      <PageHeader
        title={a.title}
        description={`${a.agentName} · ${a.actionLabel} · ${formatDateTime(a.createdAt)}`}
        actions={<StatusBadge tone={s.tone} label={s.label} />}
      />
      <div className="max-w-3xl space-y-6">
        {a.lockedBecause ? (
          <p role="note" className="bg-warning-soft rounded-lg p-3">
            {a.lockedBecause}
          </p>
        ) : null}
        {a.entityType && a.entityId && LINKS[a.entityType] ? (
          <p>
            <Link
              href={LINKS[a.entityType]!(a.entityId)}
              className="text-primary underline underline-offset-4"
            >
              Open the {a.entityType.toLowerCase()}
            </Link>
          </p>
        ) : null}
        <Card>
          <CardContent className="pt-6">
            <p className="whitespace-pre-wrap">{a.editedPreview ?? a.preview}</p>
          </CardContent>
        </Card>
        {!a.carriedOut && a.status === "PENDING" ? (
          <p className="text-muted-foreground">
            Approving doesn&apos;t send or post anything: copy it and send or post it yourself.
          </p>
        ) : null}
        {a.status === "PENDING" && platformCan(admin.role, "approvals.decide") ? (
          <DecideApproval id={a.id} text={a.preview} editable={a.editable} />
        ) : a.status === "PENDING" ? (
          <p className="text-muted-foreground">Only a Platform Owner can decide approvals.</p>
        ) : (
          <p className="text-muted-foreground">
            {a.decidedByName ? `${a.decidedByName}, ${formatDateTime(a.decidedAt)}` : null}
            {a.reason ? ` — ${a.reason}` : ""}
            {a.executionError ? ` — ${a.executionError}` : ""}
          </p>
        )}
      </div>
    </>
  );
}
