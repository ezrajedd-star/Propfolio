"use client";

import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";

import { LeaseReview } from "@/components/app/lease-review";
import { LeaseTermsFields } from "@/components/app/lease-terms-fields";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TermsForDescription } from "@/domain/leases/describe";
import type { ReminderConfig } from "@/domain/reminders/config";
import { useActionForm } from "@/hooks/use-action-form";
import { leaseTermsSchema, type LeaseTermsInput } from "@/schemas/lease";
import { renewLeaseAction } from "../../actions";

export function RenewForm({
  leaseId,
  refNo,
  unitLabel,
  tenantName,
  defaults,
  reminderConfig,
  today,
}: {
  leaseId: string;
  refNo: string;
  unitLabel: string;
  tenantName: string;
  defaults: LeaseTermsInput;
  reminderConfig: ReminderConfig;
  today: string;
}) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const { form, error, pending, onSubmit, errors } = useActionForm(
    leaseTermsSchema,
    defaults,
    async (values) => {
      const r = await renewLeaseAction(leaseId, values);
      if (r.ok) {
        toast.success(
          `Renewed ✓ The new lease is ${r.data.refNo}. ${refNo} is now marked Renewed.`,
        );
        router.push(`/leases/${r.data.id}`);
      } else if (r.fieldErrors) {
        setReviewing(false);
      }
      return r;
    },
  );
  const values = useWatch({ control: form.control });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-4xl">
      <p className="mb-4 font-medium">
        Step {reviewing ? 2 : 1} of 2 · {reviewing ? "Review and save" : "New terms"}
      </p>
      <Card>
        <CardContent className="space-y-6">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {reviewing ? (
            <LeaseReview
              unitLabel={unitLabel}
              tenantName={tenantName}
              terms={
                values as unknown as TermsForDescription & { startDate: string; endDate: string }
              }
              reminderConfig={reminderConfig}
              today={today}
            />
          ) : (
            <LeaseTermsFields control={form.control} register={form.register} errors={errors} />
          )}
        </CardContent>
      </Card>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {reviewing ? (
          <Button type="button" variant="outline" onClick={() => setReviewing(false)}>
            <ChevronLeft aria-hidden /> Back
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => router.push(`/leases/${leaseId}`)}>
            Cancel
          </Button>
        )}
        {reviewing ? (
          <Button key="save" type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Save renewal
          </Button>
        ) : (
          // A different key stops React reusing this <button> as the submit button
          // (validation resolves before the click's default action runs).
          <Button
            key="next"
            type="button"
            size="lg"
            onClick={async () => {
              if (
                await form.trigger(Object.keys(defaults) as Path<LeaseTermsInput>[], {
                  shouldFocus: true,
                })
              )
                setReviewing(true);
            }}
          >
            Next: review <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </form>
  );
}
