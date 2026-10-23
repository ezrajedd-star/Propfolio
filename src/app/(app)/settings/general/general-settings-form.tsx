"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { useForm, type Path } from "react-hook-form";
import { toast } from "sonner";

import { Field, fieldAria } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { settingsSchema, type Settings } from "@/schemas/settings";
import { updateSettingsAction } from "./actions";

export function GeneralSettingsForm({
  defaultValues,
  fromAddress,
}: {
  defaultValues: Settings;
  fromAddress: string;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<Settings>({ resolver: zodResolver(settingsSchema), defaultValues });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateSettingsAction(values);
      if (result.ok) {
        toast.success("Saved ✓");
        form.reset(values);
      } else {
        toast.error(result.message);
        for (const [k, v] of Object.entries(result.fieldErrors ?? {}))
          form.setError(k as Path<Settings>, { message: v });
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="max-w-2xl">
        <CardContent className="space-y-6">
          <Field id="companyName" label="Company name" required error={errors.companyName?.message}>
            <Input
              {...fieldAria("companyName", errors.companyName?.message)}
              {...form.register("companyName")}
            />
          </Field>
          <Field
            id="mailFromName"
            label="Email sender name"
            required
            help="The name people see in their inbox. The sending address is set by your IT administrator."
            hint={`Emails are sent from ${fromAddress}.`}
            error={errors.mailFromName?.message}
          >
            <Input
              {...fieldAria("mailFromName", errors.mailFromName?.message, true)}
              {...form.register("mailFromName")}
            />
          </Field>
          <Field
            id="mailReplyTo"
            label="Reply-to email"
            help="If someone replies to a Propfolio email, the reply goes here. Leave empty for no replies."
            error={errors.mailReplyTo?.message}
          >
            <Input
              {...fieldAria("mailReplyTo", errors.mailReplyTo?.message)}
              type="email"
              placeholder="leasing@yourcompany.com"
              {...form.register("mailReplyTo")}
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || pending}
            onClick={() => form.reset()}
          >
            Discard changes
          </Button>
          <Button type="submit" disabled={!isDirty || pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
