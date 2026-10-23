import { CircleCheck, CircleMinus, CircleAlert, Clock, Lock, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type Tone = "success" | "warning" | "danger" | "neutral" | "default";

const ICONS: Record<Tone, LucideIcon> = {
  success: CircleCheck,
  warning: Clock,
  danger: CircleAlert,
  neutral: CircleMinus,
  default: Lock,
};

/** Status colour is always paired with an icon and a text label — never colour alone. */
export function StatusBadge({
  tone,
  label,
  icon,
}: {
  tone: Tone;
  label: string;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? ICONS[tone];
  return (
    <Badge variant={tone}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
