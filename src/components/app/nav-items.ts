import {
  BarChart3,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  House,
  Settings,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/domain/auth/roles";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

/** Short navigation in plain words. Items a role can't use are hidden (and blocked on the server). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: House, permission: "occupancy.view" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, permission: "occupancy.view" },
  { href: "/leases", label: "Leases", icon: FileSpreadsheet, permission: "lease.view" },
  { href: "/units", label: "Units", icon: Building2, permission: "occupancy.view" },
  { href: "/tenants", label: "Tenants", icon: UsersRound, permission: "tenant.view" },
  { href: "/payments", label: "Payments", icon: Wallet, permission: "payment.view" },
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "report.view" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "settings.manage" },
];
