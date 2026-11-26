"use client";

import { Power } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/platform/confirm-button";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { AUTONOMY_LABELS, AUTONOMY_LEVELS, type AutonomyLevel } from "@/domain/agents/autonomy";
import { setAgentEnabledAction, setAutonomyAction } from "../../actions";

export function AgentSwitch({
  agentKey,
  name,
  enabled,
}: {
  agentKey: string;
  name: string;
  enabled: boolean;
}) {
  const [pending, start] = useTransition();
  return enabled ? (
    <ConfirmButton
      label="Switch off"
      variant="destructive"
      icon={<Power aria-hidden />}
      title={`Switch off the ${name}?`}
      description="It stops at once. Items already in the approval inbox stay there."
      confirmLabel="Switch off"
      done={`${name} is off ✓`}
      onConfirm={() => setAgentEnabledAction(agentKey, false)}
    />
  ) : (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setAgentEnabledAction(agentKey, true);
          if (r.ok) toast.success(`${name} is on ✓`);
          else toast.error(r.message);
        })
      }
    >
      <Power aria-hidden /> Switch on
    </Button>
  );
}

export function AutonomySelect({
  agentKey,
  actionType,
  label,
  level,
  locked,
}: {
  agentKey: string;
  actionType: string;
  label: string;
  level: AutonomyLevel;
  locked: boolean;
}) {
  const [pending, start] = useTransition();
  const id = `aut-${agentKey}-${actionType}`;
  if (locked)
    return <span className="text-muted-foreground">Always Draft (can&apos;t be changed)</span>;
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Autonomy for {label}
      </label>
      <NativeSelect
        id={id}
        defaultValue={level}
        disabled={pending}
        className="w-auto"
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            const r = await setAutonomyAction(agentKey, actionType, next);
            if (r.ok) toast.success("Saved ✓");
            else {
              toast.error(r.message);
              e.target.value = level;
            }
          });
        }}
      >
        {AUTONOMY_LEVELS.map((l) => (
          <option key={l} value={l}>
            {AUTONOMY_LABELS[l]}
          </option>
        ))}
      </NativeSelect>
    </>
  );
}
