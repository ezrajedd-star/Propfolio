import {
  Building2,
  BellRing,
  ChevronRight,
  Gem,
  Lock,
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
import { availableOnMessage, planIncludes, type Feature } from "@/domain/plans/plans";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS: {
  href: string;
  icon: typeof Gem;
  title: string;
  text: string;
  /** Needs a paid plan: shown with a lock, and opens the "Available on …" screen. */
  feature?: Feature;
}[] = [
  {
    href: "/plan",
    icon: Gem,
    title: "Plan",
    text: "Your plan, what it includes, and how to upgrade.",
  },
  {
    href: "/settings/users",
    icon: UsersRound,
    title: "Users",
    text: "Add people, change roles, reset passwords.",
    feature: "team",
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
    feature: "auditLog",
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
  const actor = await requirePageUser("settings.manage", { duringReadOnly: true });
  return (
    <>
      <PageHeader title="Settings" description="Only Admins can see and change these." />
      <ul className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const locked =
            s.feature && !planIncludes(actor.access.plan, s.feature)
              ? availableOnMessage(s.feature)
              : null;
          const inner = (
            <>
              <span className="bg-primary-soft text-primary flex size-11 shrink-0 items-center justify-center rounded-lg">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.title}</span>
                <span className="text-muted-foreground block">{s.text}</span>
                {locked ? (
                  <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm font-medium">
                    <Lock className="size-4" aria-hidden /> {locked}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="text-muted-foreground size-5" aria-hidden />
            </>
          );
          return (
            <li key={s.title}>
              <Link
                href={s.href}
                className="bg-card hover:bg-muted/50 flex items-center gap-4 rounded-xl border p-5 shadow-sm transition-colors"
              >
                {inner}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
