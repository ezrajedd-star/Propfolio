"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, type Path } from "react-hook-form";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resourceRequestSchema, type ResourceRequestInput } from "@/schemas/website-lead";
import { requestResourceAction } from "./actions";

/** Name and email, then the download. */
export function ResourceForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const form = useForm<ResourceRequestInput>({
    resolver: zodResolver(resourceRequestSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      resource: "lease-tracker",
      wantsUpdates: false,
      website: "",
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const r = await requestResourceAction(values);
      if (r.ok) {
        setReady(true);
        window.location.assign("/resources/lease-tracker.xlsx");
        return;
      }
      setError(r.message);
      for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
        form.setError(k as Path<ResourceRequestInput>, { message: v });
      }
    });
  });

  if (ready) {
    return (
      <div role="status" className="bg-success-soft rounded-2xl p-6">
        <p className="text-xl font-semibold">Your download has started.</p>
        <p className="text-muted-foreground mt-1">
          If it didn&apos;t, use the button below. When you outgrow it,{" "}
          <Link href="/signup" className="text-primary underline underline-offset-4">
            Propfolio is free for up to 3 units
          </Link>
          .
        </p>
        <Button asChild className="mt-4">
          <a href="/resources/lease-tracker.xlsx" download>
            <Download aria-hidden /> Download the lease tracker
          </a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="res-name" label="Your name" required error={errors.name?.message}>
          <Input
            {...fieldAria("res-name", errors.name?.message)}
            autoComplete="name"
            {...form.register("name")}
          />
        </Field>
        <Field id="res-email" label="Email" required error={errors.email?.message}>
          <Input
            {...fieldAria("res-email", errors.email?.message)}
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
        </Field>
      </div>
      <label className="flex min-h-10 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="accent-primary mt-1 size-5"
          {...form.register("wantsUpdates")}
        />
        <span>Send me occasional Propfolio news and guides. You can stop them any time.</span>
      </label>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="res-website">Website</label>
        <input id="res-website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <p className="text-muted-foreground text-sm">
        We keep your name and email to know who uses our resources, and only send news if you tick
        the box. See our{" "}
        <Link href="/legal/privacy" className="text-primary underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        Get the free template
      </Button>
    </form>
  );
}
