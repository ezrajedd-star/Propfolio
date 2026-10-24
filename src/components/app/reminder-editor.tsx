"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { WEEKDAY_NAMES } from "@/domain/time/calendar-date";
import { reminderConfigSchema, type ReminderConfig } from "@/domain/reminders/config";
import { describeConfig } from "@/domain/reminders/schedule";
import { HelpTip } from "./help-tip";

/**
 * Edit reminder settings in plain words: a list of "N days before the end date", plus what
 * happens after the last one.
 */
export function ReminderEditor({
  value,
  onChange,
  idPrefix = "rem",
}: {
  value: ReminderConfig;
  onChange: (value: ReminderConfig) => void;
  idPrefix?: string;
}) {
  const [days, setDays] = useState<string[]>(value.leadDays.map(String));
  const parsed = reminderConfigSchema.safeParse({ ...value, leadDays: days.map((d) => Number(d)) });
  const error = parsed.success ? null : parsed.error.issues[0]?.message;

  const updateDays = (next: string[]) => {
    setDays(next);
    const nums = next.map((d) => Number(d)).filter((n) => Number.isInteger(n) && n > 0);
    onChange({ ...value, leadDays: nums });
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="flex items-center gap-1 font-medium">
          Send reminders this many days before the lease ends
          <HelpTip>
            Each number is one email. For example 90, 60 and 30 sends three reminders.
          </HelpTip>
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          {days.map((d, i) => (
            <div
              key={i}
              className="bg-card flex items-center gap-1 rounded-lg border py-1 pr-1 pl-2"
            >
              <Input
                aria-label={`Reminder ${i + 1}, days before`}
                inputMode="numeric"
                value={d}
                onChange={(e) =>
                  updateDays(days.map((x, j) => (j === i ? e.target.value.replace(/\D/g, "") : x)))
                }
                className="h-9 w-20 text-center"
              />
              <span className="text-muted-foreground text-sm">days</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Remove reminder ${i + 1}`}
                disabled={days.length === 1}
                onClick={() => updateDays(days.filter((_, j) => j !== i))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          {days.length < 10 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateDays([...days, ""])}
            >
              <Plus aria-hidden /> Add reminder
            </Button>
          ) : null}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-repeat`}>After the last reminder</Label>
          <NativeSelect
            id={`${idPrefix}-repeat`}
            value={value.repeat}
            onChange={(e) => {
              const repeat = e.target.value as ReminderConfig["repeat"];
              onChange({
                ...value,
                repeat,
                repeatWeekday: repeat === "WEEKLY" ? (value.repeatWeekday ?? 1) : null,
              });
            }}
          >
            <option value="NONE">Don&apos;t repeat</option>
            <option value="WEEKLY">Repeat every week</option>
            <option value="DAILY">Repeat every day</option>
          </NativeSelect>
        </div>
        {value.repeat === "WEEKLY" ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-weekday`}>On</Label>
            <NativeSelect
              id={`${idPrefix}-weekday`}
              value={String(value.repeatWeekday ?? 1)}
              onChange={(e) => onChange({ ...value, repeatWeekday: Number(e.target.value) })}
            >
              {WEEKDAY_NAMES.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {value.repeat !== "NONE" ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-after`} className="flex items-center gap-1">
              Keep repeating after the end date for
              <HelpTip>
                Repeats stop sooner if someone marks the lease as handled, renews it or ends it.
              </HelpTip>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`${idPrefix}-after`}
                inputMode="numeric"
                className="w-24"
                value={String(value.afterExpiryDays)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    afterExpiryDays: Number(e.target.value.replace(/\D/g, "") || 0),
                  })
                }
              />
              <span className="text-muted-foreground">days</span>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : (
        <p className="bg-muted rounded-lg px-3 py-2 text-sm">
          <span className="font-medium">In short:</span> {describeConfig(parsed.data!)}
        </p>
      )}
    </div>
  );
}

export function isValidReminderConfig(value: ReminderConfig): boolean {
  return reminderConfigSchema.safeParse(value).success;
}
