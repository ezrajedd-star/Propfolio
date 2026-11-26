"use client";

import { Check, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveAction, rejectAction } from "../../../actions";

export function DecideApproval({
  id,
  text,
  editable,
}: {
  id: string;
  text: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [rejecting, setRejecting] = useState(false);
  const [pending, start] = useTransition();
  const done = () => router.push("/platform/approvals");
  return (
    <div className="space-y-4">
      {editing ? (
        <div className="space-y-2">
          <Label htmlFor="edited">Edit before approving</Label>
          <Textarea
            id="edited"
            rows={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await approveAction(id, editing ? { editedText: draft } : {});
              if (r.ok) {
                toast.success(`Approved ✓ ${r.data.result}`);
                done();
              } else toast.error(r.message);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {editing ? "Approve my edited version" : "Approve"}
        </Button>
        {editable && !editing ? (
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </Button>
        ) : null}
        <Button type="button" variant="destructive" onClick={() => setRejecting(true)}>
          Reject
        </Button>
      </div>
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this?"
        description="Say why. The reason is saved, so the agent's instructions can be improved."
        confirmLabel="Reject"
        done="Rejected ✓"
        placeholder="e.g. Too long; we don't promise dates"
        onConfirm={async (reason) => {
          const r = await rejectAction(id, { reason });
          if (r.ok) done();
          return r;
        }}
      />
    </div>
  );
}
