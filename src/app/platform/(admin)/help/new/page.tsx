import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePlatformPage } from "@/server/platform/current";
import { ArticleForm } from "../article-form";

export const metadata: Metadata = { title: "New help article" };

export default async function NewArticlePage() {
  await requirePlatformPage("help.manage");
  return (
    <>
      <BackLink href="/platform/help">Help centre</BackLink>
      <PageHeader
        title="New help article"
        description="It's saved as a draft; publish it when it's ready."
      />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <ArticleForm
            id={null}
            initial={{ title: "", body: "", category: "Getting started", language: "EN" }}
          />
        </CardContent>
      </Card>
    </>
  );
}
