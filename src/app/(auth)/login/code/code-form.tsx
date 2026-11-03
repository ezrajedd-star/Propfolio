"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInCodeAction } from "../../actions";

export function CodeForm({ next, rememberDays }: { next?: string; rememberDays: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [remember, setRemember] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const code = input.current?.value ?? "";
        setError(null);
        startTransition(async () => {
          const result = await signInCodeAction({ code, remember }, next);
          // On success the action redirects, so we only get here on failure.
          if (result && !result.ok) {
            setError(result.message);
            setFieldError(result.fieldErrors?.code);
            if (input.current) {
              input.current.value = "";
              input.current.focus();
            }
          }
        });
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field
        id="code"
        label="Code"
        hint="6 digits from your app, or a recovery code like K7PM-Q2XR."
        error={fieldError}
      >
        <Input
          ref={input}
          {...fieldAria("code", fieldError, true)}
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoFocus
          maxLength={12}
          className="w-48 tracking-widest tabular-nums"
        />
      </Field>
      <div className="flex items-start gap-3">
        <Checkbox
          id="remember"
          checked={remember}
          onCheckedChange={(v) => setRemember(v === true)}
          className="mt-1"
        />
        <Label htmlFor="remember" className="font-normal">
          Don&apos;t ask for a code on this device for {rememberDays} days. Only tick this on your
          own computer or phone.
        </Label>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
