import { Download } from "lucide-react";
import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePlatformPage } from "@/server/platform/current";
import { ImportLeadsForm } from "./import-form";

export const metadata: Metadata = { title: "Import leads" };

export default async function ImportLeadsPage() {
  await requirePlatformPage("pipeline.manage");
  return (
    <>
      <BackLink href="/platform/pipeline">Pipeline</BackLink>
      <PageHeader
        title="Import leads from a spreadsheet"
        description="Use the template. Every row is checked first: if one has a problem, nothing is imported and you'll see which rows to fix."
        actions={
          <Button asChild variant="outline">
            <a href="/platform/pipeline-template">
              <Download aria-hidden /> Download the template
            </a>
          </Button>
        }
      />
      <Card className="max-w-2xl">
        <CardContent className="space-y-4 pt-6">
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            <li>Only Name is required. Leads already in the pipeline (same email) are skipped.</li>
            <li>
              Marketing consent &quot;yes&quot; needs an email, the date they agreed and where.
              Never import bought lists.
            </li>
          </ul>
          <ImportLeadsForm />
        </CardContent>
      </Card>
    </>
  );
}
