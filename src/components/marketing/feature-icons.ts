import {
  BellRing,
  CalendarDays,
  Calculator,
  FileSpreadsheet,
  FileText,
  History,
  type LucideIcon,
  PieChart,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import type { FeatureKey } from "@/domain/marketing/content";

export const FEATURE_ICONS: Record<FeatureKey, LucideIcon> = {
  reminders: BellRing,
  calendar: CalendarDays,
  rent: Calculator,
  payments: Wallet,
  import: FileSpreadsheet,
  reports: PieChart,
  documents: FileText,
  privacy: ShieldCheck,
  teams: Users,
  audit: History,
};
