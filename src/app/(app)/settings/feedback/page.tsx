import { Download, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips } from "@/components/app/filter-chips";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { formatDateTime } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { env } from "@/server/env";
import { listFeedback } from "@/server/feedback/service";
import { FeedbackDoneButton } from "./feedback-done-button";

export const metadata: Metadata = { title: "Tester feedback" };

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const actor = await requirePageUser("settings.manage");
  const all = (await searchParams).all === "1";
  const rows = await listFeedback(actor, { includeDone: all });
  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Tester feedback"
        description={
          env().UAT_MODE
            ? "What testers sent with the 'Send feedback' button. Mark each note done once it's dealt with."
            : "The 'Send feedback' button is switched off (this is not the test version). Earlier notes stay here."
        }
        actions={
          <Button variant="outline" asChild>
            <a href="/api/v1/feedback/export">
              <Download aria-hidden /> Download for Excel
            </a>
          </Button>
        }
      />
      <div className="mb-4">
        <FilterChips
          label="Show"
          options={[
            { value: "", label: "Still to do" },
            { value: "1", label: "Everything" },
          ]}
          active={all ? "1" : ""}
          hrefFor={(v) => (v ? "/settings/feedback?all=1" : "/settings/feedback")}
        />
      </div>
      {rows.length ? (
        <ul className="bg-card divide-y rounded-xl border">
          {rows.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line">{f.message}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {f.userName} ({ROLE_LABELS[f.role]}) · {formatDateTime(f.createdAt)} · page{" "}
                  <code>{f.pagePath}</code>
                </p>
              </div>
              {f.status === "DONE" ? <Badge variant="success">Done</Badge> : null}
              <FeedbackDoneButton id={f.id} done={f.status === "DONE"} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={MessageSquareText} title={all ? "No feedback yet" : "Nothing left to do"}>
          Notes from testers will appear here.
        </EmptyState>
      )}
    </>
  );
}
