import { CalendarClock, FileUp, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_TYPE_LABELS,
  type LeadSource,
  type LeadStage,
} from "@/domain/pipeline/pipeline";
import { platformCan } from "@/domain/platform/roles";
import { fromDbDate } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { requirePlatformPage } from "@/server/platform/current";
import { listLeads } from "@/server/pipeline/service";
import { talkTodayForConsole } from "@/server/pipeline/talk-today";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pipeline" };

const VIEWS = [
  { id: "talk", label: "Talk to today" },
  { id: "board", label: "Board" },
  { id: "list", label: "List" },
  { id: "today", label: "Follow up today" },
] as const;

type Lead = Awaited<ReturnType<typeof listLeads>>[number];

function followUpText(l: Lead, today: string) {
  if (!l.nextFollowUp) return null;
  const d = fromDbDate(l.nextFollowUp);
  return d < today ? `Overdue since ${formatIsoDate(d)}` : d === today ? "Today" : formatIsoDate(d);
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; stage?: string; source?: string }>;
}) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.id === sp.view)?.id ?? "talk";
  const admin = await requirePlatformPage("pipeline.view", {
    action: "console.pipeline_viewed",
    metadata: { view },
  });
  const stage = LEAD_STAGES.find((s) => s === sp.stage) as LeadStage | undefined;
  const source = LEAD_SOURCES.find((s) => s === sp.source) as LeadSource | undefined;
  const leads =
    view === "talk"
      ? []
      : await listLeads(admin, {
          q: sp.q?.slice(0, 100),
          stage: view === "list" ? stage : undefined,
          source: view === "list" ? source : undefined,
          followUpToday: view === "today",
        });
  const today = manilaToday();
  const talk = view === "talk" ? await talkTodayForConsole(admin) : [];
  const canManage = platformCan(admin.role, "pipeline.manage");

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="People and companies we're talking to. They move by themselves when they sign up, add a lease, pay or cancel."
        actions={
          canManage ? (
            <>
              <Button asChild variant="outline">
                <Link href="/platform/pipeline/import">
                  <FileUp aria-hidden /> Import a spreadsheet
                </Link>
              </Button>
              <Button asChild>
                <Link href="/platform/pipeline/new">
                  <Plus aria-hidden /> Add a lead
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <nav aria-label="Pipeline views" className="mb-6 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={`/platform/pipeline?view=${v.id}`}
            aria-current={view === v.id ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-lg border px-4 font-medium",
              view === v.id
                ? "bg-primary-soft border-primary text-accent-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            {v.id === "today" ? <CalendarClock className="size-4" aria-hidden /> : null}
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "talk" ? (
        <>
          <p className="text-muted-foreground mb-4">
            Who is most worth a conversation today, from the buying signals (trial ending, stuck
            before their first lease, a demo request, a follow-up due, portfolio size…). The Growth
            agent drafts follow-ups for the top ones in Approvals.
          </p>
          {talk.length === 0 ? (
            <p className="bg-card text-muted-foreground rounded-xl border p-6 text-center">
              Nobody stands out today.
            </p>
          ) : (
            <ol className="bg-card divide-y rounded-xl border">
              {talk.map((l, i) => (
                <li key={l.leadId} className="flex flex-wrap items-start gap-4 px-4 py-3">
                  <span className="text-muted-foreground w-6 text-right text-lg font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/platform/pipeline/${l.leadId}`}
                      className="text-primary font-medium underline-offset-4 hover:underline"
                    >
                      {l.name}
                    </Link>
                    {l.company ? (
                      <span className="text-muted-foreground"> · {l.company}</span>
                    ) : null}
                    <span className="block">{l.reasons.join(" · ")}</span>
                  </span>
                  <span className="text-muted-foreground">{LEAD_STAGE_LABELS[l.stage]}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : view === "board" ? (
        <div
          className="flex gap-4 overflow-x-auto pb-4"
          role="region"
          aria-label="Pipeline board (scrolls sideways)"
          tabIndex={0}
        >
          {LEAD_STAGES.map((s) => {
            const inStage = leads.filter((l) => l.stage === s);
            return (
              <section
                key={s}
                aria-labelledby={`col-${s}`}
                className="bg-muted/50 w-64 shrink-0 rounded-xl p-3"
              >
                <h2 id={`col-${s}`} className="mb-3 flex justify-between font-semibold">
                  {LEAD_STAGE_LABELS[s]}{" "}
                  <span className="text-muted-foreground">{inStage.length}</span>
                </h2>
                <ul className="space-y-2">
                  {inStage.slice(0, 50).map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/platform/pipeline/${l.id}`}
                        className="bg-card hover:border-primary block rounded-lg border p-3"
                      >
                        <span className="block font-medium">{l.name}</span>
                        {l.company ? (
                          <span className="text-muted-foreground block text-sm">{l.company}</span>
                        ) : null}
                        {followUpText(l, today) ? (
                          <span className="mt-1 flex items-center gap-1 text-sm">
                            <CalendarClock className="size-4" aria-hidden />{" "}
                            {followUpText(l, today)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                  {inStage.length > 50 ? (
                    <li className="text-muted-foreground text-sm">
                      <Link href={`/platform/pipeline?view=list&stage=${s}`} className="underline">
                        and {inStage.length - 50} more
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          {view === "list" ? (
            <form className="mb-6 grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="view" value="list" />
              <div className="sm:col-span-2">
                <label htmlFor="q" className="mb-1 block font-medium">
                  Name, company or email
                </label>
                <Input id="q" name="q" defaultValue={sp.q ?? ""} />
              </div>
              <div>
                <label htmlFor="stage" className="mb-1 block font-medium">
                  Stage
                </label>
                <NativeSelect id="stage" name="stage" defaultValue={stage ?? ""}>
                  <option value="">Any</option>
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STAGE_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <label htmlFor="source" className="mb-1 block font-medium">
                  Source
                </label>
                <NativeSelect id="source" name="source" defaultValue={source ?? ""}>
                  <option value="">Any</option>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="sm:col-span-4">
                <Button type="submit">Show leads</Button>
              </div>
            </form>
          ) : (
            <p className="text-muted-foreground mb-4">
              Leads with a follow-up date today or earlier, not yet paying or lost.
            </p>
          )}
          <Card className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                      {view === "today" ? "Nobody to follow up today." : "No leads match."}
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link
                          href={`/platform/pipeline/${l.id}`}
                          className="text-primary font-medium underline-offset-4 hover:underline"
                        >
                          {l.name}
                        </Link>
                        {l.company ? (
                          <div className="text-muted-foreground text-sm">{l.company}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{LEAD_STAGE_LABELS[l.stage]}</TableCell>
                      <TableCell>{LEAD_TYPE_LABELS[l.type]}</TableCell>
                      <TableCell>{LEAD_SOURCE_LABELS[l.source]}</TableCell>
                      <TableCell>{followUpText(l, today) ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.portfolioSize ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
