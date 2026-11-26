import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACTION_TYPE_LABELS, ALWAYS_DRAFT } from "@/config/agents";
import { AUTONOMY_LABELS } from "@/domain/agents/autonomy";
import { capPercent, formatUsd } from "@/domain/agents/cost";
import { platformCan } from "@/domain/platform/roles";
import { formatDateTime } from "@/domain/time/manila";
import { agentsOverview } from "@/server/agents/state";
import { requirePlatformPage } from "@/server/platform/current";
import { AgentSwitch, AutonomySelect } from "./agent-controls";

export const metadata: Metadata = { title: "Agents" };

const RUNS_ON = {
  "managed-agents": "Claude Managed Agents",
  "github-actions": "GitHub Actions (Claude Code)",
  worker: "Propfolio's own worker",
};

export default async function AgentsPage() {
  const admin = await requirePlatformPage("agents.view", { action: "console.agents_viewed" });
  const agents = await agentsOverview(admin);
  const canManage = platformCan(admin.role, "agents.manage");
  return (
    <>
      <PageHeader
        title="Agents"
        description="The AI helpers. Each starts switched off and at Draft (everything waits for approval). Only a Platform Owner can switch them on or give them more freedom."
      />
      <div className="space-y-6">
        {agents.map((a) => {
          const pct = capPercent(a.spentUsd, a.config.monthlyCapUsd);
          return (
            <Card key={a.key}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>{a.config.name}</CardTitle>
                  <p className="text-muted-foreground">{a.config.purpose}</p>
                  <p className="text-muted-foreground text-sm">
                    {RUNS_ON[a.config.runsOn]} · model {a.config.model}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {a.enabled ? (
                    <StatusBadge tone="success" label="On" />
                  ) : (
                    <StatusBadge
                      tone="neutral"
                      label={a.stoppedReason ? `Off: ${a.stoppedReason}` : "Off"}
                    />
                  )}
                  {canManage ? (
                    <AgentSwitch agentKey={a.key} name={a.config.name} enabled={a.enabled} />
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="mb-1 font-medium">
                    This month: {formatUsd(a.spentUsd)} of {formatUsd(a.config.monthlyCapUsd)} (
                    {pct}%)
                  </p>
                  <div
                    role="meter"
                    aria-label={`${a.config.name} spending this month`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    className="bg-muted h-3 overflow-hidden rounded-full"
                  >
                    <div
                      className={
                        pct >= 90
                          ? "bg-danger h-full"
                          : pct >= 70
                            ? "bg-warning h-full"
                            : "bg-primary h-full"
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    It switches itself off at the cap.
                  </p>
                </div>
                {a.config.actionTypes.length ? (
                  <div>
                    <h3 className="mb-2 font-semibold">How much it may do alone</h3>
                    <ul className="divide-y rounded-lg border">
                      {a.config.actionTypes.map((t) => (
                        <li
                          key={t}
                          className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                        >
                          <span>{ACTION_TYPE_LABELS[t]}</span>
                          {canManage ? (
                            <AutonomySelect
                              agentKey={a.key}
                              actionType={t}
                              label={ACTION_TYPE_LABELS[t]}
                              level={a.autonomy[t] ?? "DRAFT"}
                              locked={ALWAYS_DRAFT.has(t)}
                            />
                          ) : (
                            <span>{AUTONOMY_LABELS[a.autonomy[t] ?? "DRAFT"]}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Whatever is set here, these always wait for approval: refunds and billing
                      disputes, privacy requests, legal threats, access or permission changes, and
                      prices or discounts that aren&apos;t in our plans. Tagalog and Cebuano replies
                      wait during the first month.
                    </p>
                  </div>
                ) : null}
                <div>
                  <h3 className="mb-2 font-semibold">Recent activity</h3>
                  {a.activity.length === 0 ? (
                    <p className="text-muted-foreground">Nothing yet.</p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {a.activity.map((l) => (
                        <li key={l.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                          <span>
                            <StatusBadge
                              tone={l.ok ? "success" : "warning"}
                              label={l.ok ? "Done" : "Refused"}
                            />{" "}
                            {l.action}
                            {l.summary ? ` · ${l.summary}` : ""}
                            {l.error ? ` · ${l.error}` : ""}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDateTime(l.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
