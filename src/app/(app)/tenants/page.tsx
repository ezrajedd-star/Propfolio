import { UserPlus, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/roles";
import { TENANT_TYPE_LABELS } from "@/schemas/tenant";
import { requirePageUser } from "@/server/auth/current";
import { listTenants } from "@/server/tenants/service";

export const metadata: Metadata = { title: "Tenants" };

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const actor = await requirePageUser("tenant.view");
  const { q, archived } = await searchParams;
  const tenants = await listTenants(actor, { q, includeArchived: archived === "1" });

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Companies and people who lease from us."
        actions={
          can(actor.role, "tenant.edit") ? (
            <Button asChild>
              <Link href="/tenants/new">
                <UserPlus aria-hidden /> Add tenant
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-6">
        <SearchBox
          defaultValue={q}
          placeholder="Name, contact person, email or TIN"
          keep={{ archived }}
        />
      </div>
      {tenants.length === 0 ? (
        q ? (
          <EmptyState icon={UsersRound} title={`No tenants match “${q}”`}>
            Check the spelling, try part of the name, or{" "}
            <Link href="/tenants" className="text-primary underline">
              show everyone
            </Link>
            .
          </EmptyState>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="No tenants yet"
            action={
              <Button asChild>
                <Link href="/tenants/new">Add your first tenant →</Link>
              </Button>
            }
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tenant</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Leases</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/tenants/${t.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {t.displayName}
                    </Link>
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      {TENANT_TYPE_LABELS[t.type]}
                      {t.archived ? <Badge variant="neutral">Archived</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{t.contactPerson ?? "—"}</div>
                    <div className="text-muted-foreground text-sm">
                      {[t.phone, t.email].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {t.currentLeaseCount > 0 ? (
                      <Badge variant="success">{t.currentLeaseCount} current</Badge>
                    ) : (
                      <span className="text-muted-foreground">None current</span>
                    )}
                    {t.totalLeaseCount > t.currentLeaseCount ? (
                      <span className="text-muted-foreground ml-2 text-sm">
                        {t.totalLeaseCount} in total
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="mt-6">
        <Link
          href={archived === "1" ? "/tenants" : "/tenants?archived=1"}
          className="text-primary hover:underline"
        >
          {archived === "1" ? "Hide archived tenants" : "Show archived tenants"}
        </Link>
      </p>
    </>
  );
}
