import {
  Building2,
  BellRing,
  ChevronRight,
  MailCheck,
  MessageSquareText,
  ScrollText,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/settings/users",
    icon: UsersRound,
    title: "Users",
    text: "Add people, change roles, reset passwords.",
  },
  {
    href: "/settings/general",
    icon: Settings2,
    title: "General",
    text: "Company name and email sender.",
  },
  {
    href: "/settings/audit-log",
    icon: ScrollText,
    title: "Audit log",
    text: "Who did what, and when.",
  },
  {
    href: "/settings/buildings",
    icon: Building2,
    title: "Buildings and units",
    text: "Add and edit buildings and their units.",
  },
  {
    href: "/settings/unit-types",
    icon: BellRing,
    title: "Unit types and reminders",
    text: "When to remind the team before leases end.",
  },
  {
    href: "/settings/reminder-emails",
    icon: MailCheck,
    title: "Reminder emails",
    text: "Who gets the daily email, and whether it was sent.",
  },
  {
    href: "/settings/privacy",
    icon: ShieldCheck,
    title: "Privacy",
    text: "Privacy notice, privacy officer, data retention.",
  },
  {
    href: "/settings/feedback",
    icon: MessageSquareText,
    title: "Tester feedback",
    text: "Notes sent with 'Send feedback' during the test.",
  },
];

export default async function SettingsPage() {
  await requirePageUser("settings.manage");
  return (
    <>
      <PageHeader title="Settings" description="Only Admins can see and change these." />
      <ul className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const inner = (
            <>
              <span className="bg-primary-soft text-primary flex size-11 shrink-0 items-center justify-center rounded-lg">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.title}</span>
                <span className="text-muted-foreground block">{s.text}</span>
              </span>
              {s.href ? (
                <ChevronRight className="text-muted-foreground size-5" aria-hidden />
              ) : null}
            </>
          );
          return (
            <li key={s.title}>
              {s.href ? (
                <Link
                  href={s.href}
                  className="bg-card hover:bg-muted/50 flex items-center gap-4 rounded-xl border p-5 shadow-sm transition-colors"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center gap-4 rounded-xl border border-dashed p-5 opacity-75">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
