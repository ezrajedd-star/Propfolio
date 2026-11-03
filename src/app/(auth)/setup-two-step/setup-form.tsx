"use client";

import { Check, Copy, Download, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Field, fieldAria } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmTwoStepAction } from "../two-step-actions";

/** Shows recovery codes once, with copy and download, and asks the person to confirm they kept them. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `Propfolio recovery codes\nEach code works once, if you can't use your authenticator app.\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-5">
      <FormAlert tone="info">
        Keep these somewhere safe, away from your phone: printed, or in a password manager. If you
        lose your phone, each code lets you sign in once. They won&apos;t be shown again.
      </FormAlert>
      <ul className="bg-muted/40 grid grid-cols-2 gap-2 rounded-lg border p-4 font-mono text-lg">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => toast.success("Copied ✓"))
          }
        >
          <Copy aria-hidden /> Copy
        </Button>
        <Button type="button" variant="outline" asChild>
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
            download="propfolio-recovery-codes.txt"
          >
            <Download aria-hidden /> Download
          </a>
        </Button>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="saved"
          checked={saved}
          onCheckedChange={(v) => setSaved(v === true)}
          className="mt-1"
        />
        <Label htmlFor="saved" className="font-normal">
          I&apos;ve saved my recovery codes
        </Label>
      </div>
      <Button type="button" size="lg" className="w-full" disabled={!saved} onClick={onDone}>
        <Check aria-hidden /> Done
      </Button>
    </div>
  );
}

export function SetupTwoStepForm({ secret, qrSvg }: { secret: string; qrSvg: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [codes, setCodes] = useState<string[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  if (codes) {
    return (
      <>
        <h2 className="mb-4 text-lg font-semibold">Two-step sign-in is on ✓</h2>
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            router.push("/?welcome=two-step");
            router.refresh();
          }}
        />
      </>
    );
  }

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await confirmTwoStepAction({ code: input.current?.value ?? "" });
          if (r.ok) setCodes(r.data);
          else {
            setError(r.fieldErrors?.code ?? r.message);
            input.current?.focus();
          }
        });
      }}
    >
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Get an authenticator app</h2>
        <p>
          On your phone, install a free authenticator app if you don&apos;t have one: Google
          Authenticator, Microsoft Authenticator or 1Password all work.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Add Propfolio to it</h2>
        <p>In the app, choose “Add account” and scan this code with your phone&apos;s camera.</p>
        <div
          role="img"
          aria-label="QR code for your authenticator app"
          className="mx-auto w-48 rounded-lg border bg-white p-2"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="text-muted-foreground text-sm">
          Can&apos;t scan? Choose “Enter a setup key” and type:{" "}
          <span className="text-foreground font-mono break-all" data-testid="setup-key">
            {secret}
          </span>
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Type the code it shows</h2>
        <Field id="code" label="6-digit code" error={error}>
          <Input
            ref={input}
            {...fieldAria("code", error)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="w-40 tracking-widest tabular-nums"
          />
        </Field>
      </section>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Turn on two-step sign-in
      </Button>
    </form>
  );
}
