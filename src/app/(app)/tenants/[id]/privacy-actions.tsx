"use client";

import { Download, Loader2, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { anonymiseTenantAction } from "../../settings/privacy/actions";

/** Admin-only privacy actions on a tenant: export their data, or anonymise them. */
export function PrivacyActions({
  tenantId,
  tenantName,
  canAnonymise,
  blockedReason,
}: {
  tenantId: string;
  tenantName: string;
  canAnonymise: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (confirm.trim() !== tenantName.trim()) {
        setError("Type the tenant's name exactly as shown to confirm.");
        return;
      }
      const r = await anonymiseTenantAction(tenantId, reason);
      if (r.ok) {
        toast.success("Tenant anonymised");
        setOpen(false);
        router.refresh();
      } else setError(r.fieldErrors?.reason ?? r.message);
    });

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <Button variant="outline" asChild>
        <a href={`/api/v1/tenants/${tenantId}/privacy-export`}>
          <Download aria-hidden /> Download their data
        </a>
      </Button>
      {canAnonymise ? (
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={!!blockedReason}
          title={blockedReason ?? undefined}
        >
          <ShieldOff aria-hidden /> Anonymise
        </Button>
      ) : null}
      {blockedReason ? (
        <p className="text-muted-foreground w-full text-sm">{blockedReason}</p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anonymise {tenantName}?</DialogTitle>
            <DialogDescription>
              Their name, TIN, contact details, address and notes are replaced with placeholders,
              and their uploaded documents are deleted. Rent, charges and payments stay, so the
              accounts still add up. <strong>This can&apos;t be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error ? <FormAlert>{error}</FormAlert> : null}
            <div className="space-y-2">
              <Label htmlFor="anon-reason">Reason</Label>
              <Textarea
                id="anon-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Tenant asked for their data to be erased (email of 3 Oct 2026)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="anon-confirm">
                To confirm, type the tenant&apos;s name: {tenantName}
              </Label>
              <Input
                id="anon-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep the data
            </Button>
            <Button variant="destructive" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Anonymise tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
