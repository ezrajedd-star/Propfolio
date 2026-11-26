import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { platformCan } from "@/domain/platform/roles";
import { formatDate } from "@/domain/time/manila";
import { listArticles } from "@/server/help/service";
import { requirePlatformPage } from "@/server/platform/current";

export const metadata: Metadata = { title: "Help centre" };

const TONE = { PUBLISHED: "success", DRAFT: "warning", ARCHIVED: "neutral" } as const;
const LABEL = { PUBLISHED: "Published", DRAFT: "Draft", ARCHIVED: "Archived" } as const;

export default async function HelpCentrePage() {
  const admin = await requirePlatformPage("console.view", { action: "console.help_viewed" });
  const articles = await listArticles(admin);
  return (
    <>
      <PageHeader
        title="Help centre"
        description="The public help articles at /help/articles. The Support agent answers from published ones, and proposes new ones in Approvals."
        actions={
          platformCan(admin.role, "help.manage") ? (
            <Button asChild>
              <Link href="/platform/help/new">
                <Plus aria-hidden /> New article
              </Link>
            </Button>
          ) : null
        }
      />
      {articles.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-xl border p-6 text-center">
          No articles yet.
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/platform/help/${a.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span>
                  <span className="block font-medium">{a.title}</span>
                  <span className="text-muted-foreground block text-sm">
                    {a.category} · updated {formatDate(a.updatedAt)}
                    {a.source === "agent" ? " · written by the Support agent" : ""}
                  </span>
                </span>
                <StatusBadge tone={TONE[a.status]} label={LABEL[a.status]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
