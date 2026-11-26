import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_ROLE_LABELS } from "@/domain/platform/roles";
import { formatDateTime } from "@/domain/time/manila";
import { requirePlatformPage } from "@/server/platform/current";
import { listStaff } from "@/server/platform/staff";
import { AddStaffForm, StaffRowActions } from "./staff-forms";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const admin = await requirePlatformPage("staff.manage", { action: "console.staff_viewed" });
  const staff = await listStaff(admin);
  return (
    <>
      <PageHeader
        title="Staff"
        description="Propfolio people who can use this console. Everyone signs in with a password and an authenticator code. Nobody is deleted, only turned off."
      />
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add a staff member</CardTitle>
        </CardHeader>
        <CardContent>
          <AddStaffForm />
        </CardContent>
      </Card>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead>Role and actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.id} className="align-top">
                <TableCell>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground text-sm">{s.email}</div>
                  <div className="text-sm">{PLATFORM_ROLE_LABELS[s.role]}</div>
                </TableCell>
                <TableCell>
                  {!s.isActive ? (
                    <Badge variant="neutral">Turned off</Badge>
                  ) : !s.totpConfirmedAt ? (
                    <Badge variant="warning">Set-up not finished</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </TableCell>
                <TableCell>{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "Never"}</TableCell>
                <TableCell>
                  <StaffRowActions
                    id={s.id}
                    name={s.name}
                    role={s.role}
                    isActive={s.isActive}
                    isSelf={s.id === admin.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
