import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EMPTY_DISCOVERY,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_TYPE_LABELS,
  type DiscoveryNotes,
} from "@/domain/pipeline/pipeline";
import { platformCan } from "@/domain/platform/roles";
import { formatDate, formatDateTime } from "@/domain/time/manila";
import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";
import { requirePlatformPage } from "@/server/platform/current";
import { listStaffNames } from "@/server/platform/staff";
import { getLead } from "@/server/pipeline/service";
import { requestMeta } from "@/server/request-meta";
import { LeadForm } from "../lead-form";
import { AddActivityForm, DeleteLeadButton, DiscoveryForm, MoveStageForm } from "./lead-actions";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = await requirePlatformPage("pipeline.view");
  const [lead, staff] = await Promise.all([
    getLead(admin, id, await requestMeta()).catch((err: unknown) => {
      if (err instanceof NotFoundError) notFound();
      throw err;
    }),
    listStaffNames(admin),
  ]);
  const canManage = platformCan(admin.role, "pipeline.manage");
  const discovery = { ...EMPTY_DISCOVERY, ...((lead.discovery as Partial<DiscoveryNotes>) ?? {}) };
  return (
    <>
      <BackLink href="/platform/pipeline">Pipeline</BackLink>
      <PageHeader
        title={lead.name}
        description={[
          lead.company,
          LEAD_TYPE_LABELS[lead.type],
          `from ${LEAD_SOURCE_LABELS[lead.source]}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <StatusBadge
            tone={
              lead.stage === "PAYING" ? "success" : lead.stage === "LOST" ? "neutral" : "default"
            }
            label={LEAD_STAGE_LABELS[lead.stage]}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Add to the timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <AddActivityForm leadId={lead.id} />
              </CardContent>
            </Card>
          ) : null}
          <section aria-labelledby="timeline">
            <h2 id="timeline" className="mb-3 text-xl font-semibold">
              Timeline
            </h2>
            <ol className="bg-card divide-y rounded-xl border">
              {lead.activities.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <p className="whitespace-pre-wrap">{a.text}</p>
                  <p className="text-muted-foreground text-sm">
                    {a.actorName} · {formatDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Discovery notes</CardTitle>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <DiscoveryForm leadId={lead.id} initial={discovery} />
              ) : (
                <p className="text-muted-foreground">{discovery.currentTool || "None yet."}</p>
              )}
            </CardContent>
          </Card>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <LeadForm
                  leadId={lead.id}
                  staff={staff}
                  initial={{
                    name: lead.name,
                    company: lead.company,
                    type: lead.type,
                    email: lead.email ?? "",
                    phone: lead.phone ?? "",
                    source: lead.source,
                    portfolioSize: lead.portfolioSize ?? "",
                    notes: lead.notes,
                    nextFollowUp: lead.nextFollowUp ?? "",
                    ownerId: lead.ownerId ?? "",
                    marketingConsent: lead.marketingConsent,
                    consentSource: lead.consentSource ?? "",
                  }}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Move</CardTitle>
              </CardHeader>
              <CardContent>
                <MoveStageForm leadId={lead.id} stage={lead.stage} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                <span className="font-medium">Email:</span> {lead.email ?? "—"}
              </p>
              <p>
                <span className="font-medium">Phone:</span> {lead.phone ?? "—"}
              </p>
              <p>
                <span className="font-medium">Units:</span> {lead.portfolioSize ?? "—"}
              </p>
              <p>
                <span className="font-medium">Marketing:</span>{" "}
                {lead.marketingConsent
                  ? `Agreed ${formatDate(lead.consentAt)} (${lead.consentSource})`
                  : lead.unsubscribedAt
                    ? `Unsubscribed ${formatDate(lead.unsubscribedAt)}`
                    : "No consent: no marketing emails"}
              </p>
              {lead.stage === "LOST" && lead.lostReason ? (
                <p>
                  <span className="font-medium">Lost because:</span> {lead.lostReason}
                </p>
              ) : null}
              <p>
                <span className="font-medium">Account:</span>{" "}
                {lead.account ? (
                  <Link
                    href={`/platform/accounts/${lead.account.id}`}
                    className="text-primary underline"
                  >
                    {lead.account.name}
                  </Link>
                ) : (
                  "Not signed up yet"
                )}
              </p>
            </CardContent>
          </Card>
          {canManage ? <DeleteLeadButton leadId={lead.id} name={lead.name} /> : null}
        </div>
      </div>
    </>
  );
}
