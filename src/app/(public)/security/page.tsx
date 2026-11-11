import {
  Building2,
  DatabaseBackup,
  FileLock2,
  History,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Security and privacy",
  description:
    "How Propfolio keeps lessors' and tenants' data safe, and helps with the Data Privacy Act.",
};

/** Facts only: each line is something Propfolio does today (see docs/security-summary.md). */
const PROTECTIONS = [
  {
    icon: Building2,
    title: "Your account, walled off",
    text: "Every customer's data is kept apart twice: by the app on every request, and by the database itself, which only returns your account's rows.",
  },
  {
    icon: KeyRound,
    title: "Two-step sign-in",
    text: "A code from an authenticator app, required for Owners and Admins and available to everyone. Ten recovery codes for a lost phone.",
  },
  {
    icon: Lock,
    title: "Strong passwords, safely stored",
    text: "At least 12 characters, checked against known leaked passwords, and stored only as a one-way hash. Five wrong tries lock sign-in for 15 minutes.",
  },
  {
    icon: UserCheck,
    title: "The right access for each person",
    text: "Owner, Admin, Leasing Staff and a read-only role. Read-only people never receive tenant contact details, money or documents.",
  },
  {
    icon: FileLock2,
    title: "Private documents",
    text: "Contracts and IDs are never public: each one opens through a link that expires after 5 minutes, and every view is recorded.",
  },
  {
    icon: History,
    title: "An audit log nobody can edit",
    text: "Sign-ins, changes, exports and downloads are recorded with who and when. Entries can't be changed or deleted.",
  },
  {
    icon: DatabaseBackup,
    title: "Backups, tested",
    text: "Regular backups, and we practise restoring them, so a bad day doesn't become a lost year.",
  },
  {
    icon: ShieldCheck,
    title: "HTTPS everywhere",
    text: "Every connection is encrypted, and browsers are told to never use an unencrypted one.",
  },
];

const PRIVACY = [
  "Record how each tenant received your privacy notice.",
  "Export everything about one tenant when they ask.",
  "Anonymise a tenant's personal data when it's no longer needed, keeping the financial records.",
  "Retention rules that tell you when records can go.",
  "A Data Processing Agreement between you (the controller) and us (the processor).",
];

export default function SecurityPage() {
  return (
    <>
      <section className="px-4 pt-14 pb-6 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">
          Security and privacy
        </p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your tenants trust you. You can trust Propfolio.
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          Lease records hold names, IDs and money. Here is, in plain words, how we protect them.
        </p>
      </section>

      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROTECTIONS.map((p) => (
            <div key={p.title} className="rounded-2xl border p-6">
              <span className="bg-primary-soft text-primary inline-flex size-11 items-center justify-center rounded-xl">
                <p.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-semibold">{p.title}</h2>
              <p className="text-muted-foreground mt-2">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        className="bg-muted/40"
        eyebrow="Data Privacy Act (RA 10173)"
        title="Privacy tools, built in."
        lead="You are the personal information controller for your tenants' data; Propfolio processes it for you. These tools are on every plan."
      >
        <ul className="bg-card divide-y rounded-2xl border">
          {PRIVACY.map((t) => (
            <li key={t} className="flex gap-3 p-5 text-lg">
              <ShieldCheck className="text-primary mt-1 size-5 shrink-0" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-6">
          Read our{" "}
          <Link href="/legal/privacy" className="text-primary underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/legal/dpa" className="text-primary underline underline-offset-4">
            Data Processing Agreement
          </Link>
          . Found a security problem?{" "}
          <Link href="/contact" className="text-primary underline underline-offset-4">
            Tell us
          </Link>
          .
        </p>
      </Section>

      <CtaBand />
    </>
  );
}
