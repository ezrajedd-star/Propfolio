"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIsoDate } from "@/domain/time/manila";
import { purgeRetentionAction } from "./actions";

export function RetentionSection({
  years,
  rows,
}: {
  years: number;
  rows: {
    tenantId: string;
    name: string;
    leases: number;
    lastLeaseEnd: string | null;
    dueOn: string;
  }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Records past the retention period</CardTitle>
        <p className="text-muted-foreground">
          Tenants whose last lease ended more than {years} years ago. Anonymising removes their
          personal data and deletes their documents; rent and payment records are kept.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="flex items-center gap-2">
            <ShieldCheck className="text-success size-5" aria-hidden /> Nothing is past the
            retention period.
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {rows.map((r) => (
                <li
                  key={r.tenantId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <Link
                    href={`/tenants/${r.tenantId}`}
                    className="text-primary font-medium underline"
                  >
                    {r.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {r.lastLeaseEnd
                      ? `Last lease ended ${formatIsoDate(r.lastLeaseEnd)}`
                      : "No leases"}{" "}
                    · due since {formatIsoDate(r.dueOn)}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-4"
              variant="destructive"
              onClick={() => setOpen(true)}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Anonymise {rows.length} tenant{rows.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </CardContent>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymise {rows.length} tenant(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Their personal data is replaced with placeholders and their documents are deleted.
              This can&apos;t be undone. It is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                start(async () => {
                  const r = await purgeRetentionAction();
                  if (r.ok) {
                    toast.success(`${r.data.count} tenant(s) anonymised`);
                    router.refresh();
                  } else toast.error(r.message);
                })
              }
            >
              Anonymise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
