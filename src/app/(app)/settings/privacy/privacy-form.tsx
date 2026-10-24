"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionForm } from "@/hooks/use-action-form";
import {
  DEFAULT_PRIVACY_NOTICE,
  renderPrivacyNotice,
  settingsSchema,
  type Settings,
} from "@/schemas/settings";
import { saveSettingsAction } from "../property-actions";

const privacySchema = settingsSchema
  .pick({ privacyNotice: true, dpoName: true, dpoEmail: true, retentionYears: true })
  .extend({
    retentionYears: z.coerce.number().pipe(settingsSchema.shape.retentionYears),
  });

type Values = Pick<Settings, "privacyNotice" | "dpoName" | "dpoEmail" | "retentionYears">;

export function PrivacyForm({ initial, companyName }: { initial: Values; companyName: string }) {
  const [showPreview, setShowPreview] = useState(false);
  const { form, error, pending, onSubmit, errors } = useActionForm(
    privacySchema,
    initial,
    async (values) => {
      const r = await saveSettingsAction(values);
      if (r.ok) {
        toast.success("Saved ✓");
        form.reset(values);
      }
      return r;
    },
  );
  const watched = form.watch();

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Privacy officer</CardTitle>
          <CardDescription>
            Named in the privacy notice as the person tenants contact about their data.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field id="dpoName" label="Name or title" required error={errors.dpoName?.message}>
            <Input
              {...fieldAria("dpoName", errors.dpoName?.message)}
              {...form.register("dpoName")}
            />
          </Field>
          <Field id="dpoEmail" label="Email" required error={errors.dpoEmail?.message}>
            <Input
              {...fieldAria("dpoEmail", errors.dpoEmail?.message)}
              type="email"
              {...form.register("dpoEmail")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How long we keep tenant data</CardTitle>
          <CardDescription>
            After this many years from the end of a tenant&apos;s last lease, their personal details
            are anonymised. Financial totals are kept. 10 years matches the period in which claims
            on written contracts can be filed (Civil Code, Art. 1144).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field
            id="retentionYears"
            label="Keep for"
            required
            error={errors.retentionYears?.message}
          >
            <div className="flex items-center gap-2">
              <Input
                {...fieldAria("retentionYears", errors.retentionYears?.message)}
                inputMode="numeric"
                className="w-24"
                {...form.register("retentionYears")}
              />
              <span className="text-muted-foreground">years after the last lease ends</span>
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy notice</CardTitle>
          <CardDescription>
            Shown when a tenant is added. These words are filled in automatically:{" "}
            {"{{companyName}}"}, {"{{dpoName}}"}, {"{{dpoEmail}}"}, {"{{retentionYears}}"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="privacyNotice"
            label="Notice text"
            required
            error={errors.privacyNotice?.message}
          >
            <Textarea
              {...fieldAria("privacyNotice", errors.privacyNotice?.message)}
              rows={16}
              className="font-mono text-sm"
              {...form.register("privacyNotice")}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide preview" : "Preview as tenants see it"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                form.setValue("privacyNotice", DEFAULT_PRIVACY_NOTICE, { shouldDirty: true })
              }
            >
              Use the standard wording
            </Button>
          </div>
          {showPreview ? (
            <div className="bg-muted/40 rounded-lg border p-4 whitespace-pre-wrap">
              {renderPrivacyNotice({
                ...watched,
                retentionYears: Number(watched.retentionYears) || 0,
                companyName,
              })}
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save privacy settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
