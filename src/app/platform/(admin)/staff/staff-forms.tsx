"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, Power, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { ConfirmButton } from "@/components/platform/confirm-button";
import { SetupLinkBox } from "@/components/platform/setup-link-box";
import { useActionForm } from "@/components/platform/use-action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  PLATFORM_ROLES,
  PLATFORM_ROLE_DESCRIPTIONS,
  PLATFORM_ROLE_LABELS,
  type PlatformRole,
} from "@/domain/platform/roles";
import { addStaffSchema } from "@/schemas/platform";
import {
  addStaffAction,
  changeStaffRoleAction,
  resetStaffSignInAction,
  setStaffActiveAction,
} from "../../actions";

type AddValues = z.input<typeof addStaffSchema>;

export function AddStaffForm() {
  const blank: AddValues = { name: "", email: "", role: "PLATFORM_READONLY" };
  const [link, setLink] = useState<{ link: string; who: string } | null>(null);
  const form = useForm<AddValues>({ resolver: zodResolver(addStaffSchema), defaultValues: blank });
  const { errors } = form.formState;
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => addStaffAction(v),
    "Added ✓",
    blank,
    (data, values) => setLink({ link: data, who: values.name || "them" }),
  );
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-3">
        <Field id="staffName" label="Name" required error={errors.name?.message}>
          <Input {...fieldAria("staffName", errors.name?.message)} {...form.register("name")} />
        </Field>
        <Field id="staffEmail" label="Email" required error={errors.email?.message}>
          <Input
            type="email"
            {...fieldAria("staffEmail", errors.email?.message)}
            {...form.register("email")}
          />
        </Field>
        <Field id="staffRole" label="Role" required error={errors.role?.message}>
          <NativeSelect id="staffRole" {...form.register("role")}>
            {PLATFORM_ROLES.map((r) => (
              <option key={r} value={r}>
                {PLATFORM_ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
            Add staff member
          </Button>
        </div>
      </form>
      {link ? <SetupLinkBox link={link.link} who={link.who} /> : null}
    </div>
  );
}

export function StaffRowActions({
  id,
  name,
  role,
  isActive,
  isSelf,
}: {
  id: string;
  name: string;
  role: PlatformRole;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  if (isSelf) return <span className="text-muted-foreground">This is you</span>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`role-${id}`} className="sr-only">
          Role for {name}
        </label>
        <NativeSelect
          id={`role-${id}`}
          defaultValue={role}
          disabled={pending || !isActive}
          className="w-auto"
          onChange={(e) => {
            const next = e.target.value as PlatformRole;
            start(async () => {
              const r = await changeStaffRoleAction(id, { role: next });
              if (r.ok) toast.success(`${name} is now ${PLATFORM_ROLE_LABELS[next]} ✓`);
              else {
                toast.error(r.message);
                e.target.value = role;
              }
            });
          }}
        >
          {PLATFORM_ROLES.map((r) => (
            <option key={r} value={r}>
              {PLATFORM_ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
        {isActive ? (
          <>
            <ConfirmButton
              label="Reset sign-in"
              icon={<KeyRound aria-hidden />}
              title={`Reset ${name}'s sign-in?`}
              description="Their password and authenticator are cleared and they are signed out. You'll get a new one-time set-up link to send them."
              confirmLabel="Reset sign-in"
              done={null}
              onConfirm={() => resetStaffSignInAction(id)}
              onDone={(l) => setLink(l)}
            />
            <ConfirmButton
              label="Turn off"
              variant="destructive"
              icon={<Power aria-hidden />}
              title={`Turn off ${name}?`}
              description="They are signed out at once and can't sign in. Nothing is deleted, and you can turn them back on."
              confirmLabel="Turn off"
              done={`${name} is turned off ✓`}
              onConfirm={() => setStaffActiveAction(id, false)}
            />
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setStaffActiveAction(id, true);
                if (r.ok) toast.success(`${name} is turned back on ✓`);
                else toast.error(r.message);
              })
            }
          >
            <Power aria-hidden /> Turn back on
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{PLATFORM_ROLE_DESCRIPTIONS[role]}</p>
      {link ? <SetupLinkBox link={link} who={name} /> : null}
    </div>
  );
}
