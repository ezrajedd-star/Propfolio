import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ACTION_TYPE_LABELS, AGENTS, type ActionType, type AgentKey } from "@/config/agents";
import { formatDateTime } from "@/domain/time/manila";
import { listApprovals } from "@/server/agents/approvals";
import { requirePlatformPage } from "@/server/platform/current";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Approvals" };

const TABS = [
  { id: "WAITING", label: "Waiting" },
  { id: "TOLD", label: "Done and told" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "FAILED", label: "Failed" },
] as const;

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const admin = await requirePlatformPage("approvals.view", { action: "console.approvals_viewed" });
  const { tab: requested } = await searchParams;
  const tab = TABS.find((t) => t.id === requested)?.id ?? "WAITING";
  const items = await listApprovals(admin, { status: tab });
  return (
    <>
      <PageHeader
        title="Approvals"
        description="What the agents want to do, waiting for a person. Approve, edit then approve, or reject with a reason."
      />
      <nav aria-label="Approval lists" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/platform/approvals?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center rounded-lg border px-4 font-medium",
              tab === t.id
                ? "bg-primary-soft border-primary text-accent-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-xl border p-6 text-center">
          {tab === "WAITING" ? "Nothing is waiting. 🎉" : "Nothing here."}
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                href={`/platform/approvals/${a.id}`}
                className="hover:bg-muted/50 block px-4 py-4"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.title}</span>
                  {a.lockedBecause ? (
                    <StatusBadge tone="warning" label="Always needs approval" />
                  ) : null}
                </span>
                <span className="text-muted-foreground block">
                  {AGENTS[a.agentKey as AgentKey]?.name ?? a.agentKey} ·{" "}
                  {ACTION_TYPE_LABELS[a.actionType as ActionType] ?? a.actionType} ·{" "}
                  {formatDateTime(a.createdAt)}
                </span>
                <span className="mt-1 line-clamp-2 block whitespace-pre-wrap">{a.preview}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
