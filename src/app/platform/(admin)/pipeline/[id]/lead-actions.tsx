"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ReasonDialog } from "@/components/app/reason-dialog";
import { FormAlert } from "@/components/form/form-alert";
import { Field, fieldAria } from "@/components/form/field";
import { useActionForm } from "@/components/platform/use-action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  type DiscoveryNotes,
  type LeadStage,
} from "@/domain/pipeline/pipeline";
import { ACTIVITY_KINDS, discoverySchema } from "@/schemas/pipeline";
import {
  addLeadActivityAction,
  deleteLeadAction,
  moveLeadStageAction,
  saveDiscoveryAction,
} from "../../../actions";

export function MoveStageForm({ leadId, stage }: { leadId: string; stage: LeadStage }) {
  const [next, setNext] = useState<LeadStage>(stage);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await moveLeadStageAction(leadId, { stage: next, lostReason: reason });
          if (r.ok) {
            setError(null);
            toast.success(`Moved to ${LEAD_STAGE_LABELS[next]} ✓`);
          } else setError(r.fieldErrors?.lostReason ?? r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Label htmlFor="stage">Stage</Label>
      <NativeSelect id="stage" value={next} onChange={(e) => setNext(e.target.value as LeadStage)}>
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STAGE_LABELS[s]}
          </option>
        ))}
      </NativeSelect>
      {next === "LOST" ? (
        <>
          <Label htmlFor="lostReason">Why were they lost?</Label>
          <Input
            id="lostReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Went with another tool"
          />
        </>
      ) : null}
      <Button type="submit" disabled={pending || next === stage}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Move
      </Button>
    </form>
  );
}

const KIND_LABELS: Record<(typeof ACTIVITY_KINDS)[number], string> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  MESSAGE: "Message (Viber, LinkedIn…)",
  MEETING: "Meeting",
};

export function AddActivityForm({ leadId }: { leadId: string }) {
  const [kind, setKind] = useState<(typeof ACTIVITY_KINDS)[number]>("NOTE");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addLeadActivityAction(leadId, { kind, text });
          if (r.ok) {
            setText("");
            setError(null);
            toast.success("Added to the timeline ✓");
          } else setError(r.fieldErrors?.text ?? r.message);
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div>
          <Label htmlFor="kind">What happened</Label>
          <NativeSelect
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof ACTIVITY_KINDS)[number])}
          >
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="activityText">Details</Label>
          <Textarea
            id="activityText"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Add to timeline
      </Button>
    </form>
  );
}

type DiscoveryValues = z.input<typeof discoverySchema>;

export function DiscoveryForm({ leadId, initial }: { leadId: string; initial: DiscoveryNotes }) {
  const form = useForm<DiscoveryValues>({
    resolver: zodResolver(discoverySchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => saveDiscoveryAction(leadId, v),
    "Discovery notes saved ✓",
    form.getValues(),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field id="d-tool" label="What do they use now?" error={errors.currentTool?.message}>
        <Input
          {...fieldAria("d-tool")}
          placeholder="e.g. Excel and a notebook"
          {...form.register("currentTool")}
        />
      </Field>
      {([0, 1, 2] as const).map((i) => (
        <Field key={i} id={`d-pain${i}`} label={`Pain ${i + 1}`}>
          <Input {...fieldAria(`d-pain${i}`)} {...form.register(`pains.${i}`)} />
        </Field>
      ))}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="d-strength"
          label="How strong is the pain? (1–5)"
          error={errors.painStrength?.message}
        >
          <NativeSelect id="d-strength" {...form.register("painStrength")}>
            <option value="">Not asked</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
                {n === 1 ? " (mild)" : n === 5 ? " (desperate)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="d-price" label="Price they suggested">
          <Input
            {...fieldAria("d-price")}
            placeholder="e.g. ₱1,000 a month"
            {...form.register("priceSuggested")}
          />
        </Field>
        <Field id="d-pilot" label="Interested in a pilot?">
          <NativeSelect id="d-pilot" {...form.register("pilotInterest")}>
            <option value="">Not asked</option>
            <option value="yes">Yes</option>
            <option value="maybe">Maybe</option>
            <option value="no">No</option>
          </NativeSelect>
        </Field>
      </div>
      <Field id="d-quote" label="Best thing they said (their words)">
        <Textarea {...fieldAria("d-quote")} rows={2} {...form.register("bestQuote")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Save discovery notes
      </Button>
    </form>
  );
}

export function DeleteLeadButton({ leadId, name }: { leadId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Delete (privacy request)
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name} for good?`}
        description="For a request to delete their personal data. The lead, its timeline and their Brevo contact are deleted and can't be brought back. Only your reason is kept."
        confirmLabel="Delete for good"
        done="Deleted ✓"
        placeholder="e.g. Asked by email on 3 Dec to delete their data"
        onConfirm={(reason) => deleteLeadAction(leadId, { reason })}
      />
    </>
  );
}
