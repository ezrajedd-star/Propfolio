"use client";

import { Archive, Loader2, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { isValidReminderConfig, ReminderEditor } from "@/components/app/reminder-editor";
import { FormAlert } from "@/components/form/form-alert";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ReminderConfig } from "@/domain/reminders/config";
import { describeConfig } from "@/domain/reminders/schedule";
import type { UnitTypeView } from "@/server/property/unit-types";
import { archiveUnitTypeAction, saveSettingsAction, saveUnitTypeAction } from "../property-actions";

export function SystemDefaultCard({ initial }: { initial: ReminderConfig }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Default reminders</CardTitle>
        <CardDescription>
          Used by any unit type that doesn&apos;t have its own settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ReminderEditor value={value} onChange={setValue} idPrefix="system" />
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          disabled={!dirty || pending || !isValidReminderConfig(value)}
          onClick={() =>
            startTransition(async () => {
              const r = await saveSettingsAction({ reminderDefaults: value });
              if (r.ok) toast.success("Saved ✓");
              else toast.error(r.message);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save default reminders
        </Button>
      </CardFooter>
    </Card>
  );
}

function UnitTypeDialog({
  unitType,
  systemDefault,
  onClose,
}: {
  unitType: UnitTypeView | null;
  systemDefault: ReminderConfig;
  onClose: () => void;
}) {
  const [name, setName] = useState(unitType?.name ?? "");
  const [own, setOwn] = useState(unitType ? unitType.reminderConfig !== null : true);
  const [config, setConfig] = useState<ReminderConfig>(unitType?.reminderConfig ?? systemDefault);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      setNameError(undefined);
      const r = await saveUnitTypeAction(unitType?.id ?? null, {
        name,
        reminderConfig: own ? config : null,
      });
      if (r.ok) {
        toast.success(unitType ? "Saved ✓" : `${name} added ✓`);
        onClose();
      } else {
        setError(r.message);
        setNameError(r.fieldErrors?.name);
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{unitType ? `Edit ${unitType.name}` : "Add a unit type"}</DialogTitle>
          <DialogDescription>
            Changing reminders here affects every unit of this type that doesn&apos;t have its own
            override.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id="ut-name" label="Name" required error={nameError}>
            <Input
              id="ut-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office, Retail, Warehouse"
            />
          </Field>
          <div className="flex items-center gap-3">
            <Switch id="ut-own" checked={own} onCheckedChange={setOwn} />
            <Label htmlFor="ut-own" className="font-normal">
              Use its own reminder settings
            </Label>
          </div>
          {own ? (
            <ReminderEditor value={config} onChange={setConfig} idPrefix="ut" />
          ) : (
            <p className="bg-muted rounded-lg px-3 py-2">
              Uses the default: {describeConfig(systemDefault)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={pending || !name.trim() || (own && !isValidReminderConfig(config))}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {unitType ? "Save changes" : "Add unit type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnitTypesList({
  unitTypes,
  systemDefault,
}: {
  unitTypes: UnitTypeView[];
  systemDefault: ReminderConfig;
}) {
  const [editing, setEditing] = useState<UnitTypeView | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const archive = (t: UnitTypeView) =>
    startTransition(async () => {
      const r = await archiveUnitTypeAction(t.id, true);
      if (!r.ok) return void toast.error(r.message);
      toast.success(`${t.name} archived`, {
        action: { label: "Undo", onClick: () => void archiveUnitTypeAction(t.id, false) },
      });
    });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Unit types</h2>
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Add unit type
        </Button>
      </div>
      <ul className="grid gap-3">
        {unitTypes.map((t) => (
          <li
            key={t.id}
            className="bg-card flex items-center gap-4 rounded-xl border p-4 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {t.name}{" "}
                <span className="text-muted-foreground font-normal">
                  · {t.unitCount} unit{t.unitCount === 1 ? "" : "s"}
                </span>
              </p>
              <p className="text-muted-foreground">
                {t.reminderConfig
                  ? describeConfig(t.reminderConfig)
                  : `Default (${describeConfig(systemDefault)})`}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${t.name}`}
                  disabled={pending}
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(t)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => archive(t)}>
                  <Archive /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
      {editing ? (
        <UnitTypeDialog
          unitType={editing === "new" ? null : editing}
          systemDefault={systemDefault}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
