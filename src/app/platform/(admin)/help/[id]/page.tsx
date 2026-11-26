import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { ArticleBody } from "@/components/marketing/article-body";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HELP_CATEGORIES, type HelpCategory } from "@/domain/help/articles";
import { platformCan } from "@/domain/platform/roles";
import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";
import { getArticle } from "@/server/help/service";
import { requirePlatformPage } from "@/server/platform/current";
import { ArticleForm, ArticleStatusButtons } from "../article-form";

export const metadata: Metadata = { title: "Help article" };

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = await requirePlatformPage("console.view");
  const a = await getArticle(admin, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const canManage = platformCan(admin.role, "help.manage");
  return (
    <>
      <BackLink href="/platform/help">Help centre</BackLink>
      <PageHeader
        title={a.title}
        description={`${a.status === "PUBLISHED" ? "Published" : a.status === "DRAFT" ? "Draft" : "Archived"} · /help/articles/${a.slug}`}
        actions={
          canManage ? <ArticleStatusButtons id={a.id} status={a.status} slug={a.slug} /> : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Edit</CardTitle>
            </CardHeader>
            <CardContent>
              <ArticleForm
                id={a.id}
                initial={{
                  title: a.title,
                  body: a.body,
                  category: (HELP_CATEGORIES as readonly string[]).includes(a.category)
                    ? (a.category as HelpCategory)
                    : "Getting started",
                  language: a.language,
                }}
              />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>How it looks</CardTitle>
          </CardHeader>
          <CardContent>
            <ArticleBody body={a.body} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
