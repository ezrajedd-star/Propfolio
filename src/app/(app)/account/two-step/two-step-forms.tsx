"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Field, fieldAria } from "@/components/form/field";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecoveryCodes } from "../../../(auth)/setup-two-step/setup-form";
import {
  forgetDevicesAction,
  newRecoveryCodesAction,
  turnOffTwoStepAction,
} from "../../../(auth)/two-step-actions";

function CodeInput({ id, error }: { id: string; error?: string }) {
  return (
    <Field id={id} label="6-digit code from your app" error={error}>
      <Input
        {...fieldAria(id, error)}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        className="w-40 tracking-widest tabular-nums"
      />
    </Field>
  );
}

export function NewRecoveryCodes() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [codes, setCodes] = useState<string[] | null>(null);
  const form = useRef<HTMLFormElement>(null);
  if (codes) {
    return (
      <RecoveryCodes
        codes={codes}
        onDone={() => {
          setCodes(null);
          router.refresh();
        }}
      />
    );
  }
  return (
    <form
      ref={form}
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code") ?? "");
        start(async () => {
          const r = await newRecoveryCodesAction({ code });
          if (r.ok) {
            setError(undefined);
            setCodes(r.data);
          } else setError(r.fieldErrors?.code ?? r.message);
        });
      }}
    >
      <CodeInput id="recovery-code-check" error={error} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Make new recovery codes
      </Button>
    </form>
  );
}

export function ForgetDevicesButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await forgetDevicesAction();
          if (r.ok) toast.success("Every device will ask for a code again ✓");
          else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      Forget remembered devices
    </Button>
  );
}

export function TurnOffTwoStep() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await turnOffTwoStepAction({
            password: String(data.get("password") ?? ""),
            code: String(data.get("code") ?? ""),
          });
          if (r.ok) toast.success("Two-step sign-in is off");
          else setErrors({ form: r.message, ...(r.fieldErrors ?? {}) });
        });
      }}
    >
      <Field id="turn-off-password" label="Your password" error={errors.password}>
        <PasswordInput
          {...fieldAria("turn-off-password", errors.password)}
          name="password"
          autoComplete="current-password"
        />
      </Field>
      <CodeInput
        id="turn-off-code"
        error={errors.code ?? (errors.password ? undefined : errors.form)}
      />
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Turn off two-step sign-in
      </Button>
    </form>
  );
}
