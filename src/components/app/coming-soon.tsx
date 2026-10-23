import { Hammer } from "lucide-react";

import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Placeholder for screens that arrive in a later build phase. */
export function ComingSoon({
  title,
  description,
  what,
}: {
  title: string;
  description: string;
  what: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={Hammer} title="This screen is being built">
        {what}
      </EmptyState>
    </>
  );
}
