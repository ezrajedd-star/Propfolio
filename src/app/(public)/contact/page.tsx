import { CalendarCheck, Clock, Mail, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";

import { Section } from "@/components/marketing/section";
import { COMPANY, isPlaceholder } from "@/domain/legal/company";
import { env } from "@/server/env";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "Contact and book a demo",
  description: "Book a 30-minute Propfolio demo, or get in touch with questions.",
};

// Reads the support email (a server setting) when the page is shown, not when it is built.
export const dynamic = "force-dynamic";

/** How to reach Propfolio, and the "Book a demo" form. */
export default function ContactPage() {
  const email = env().SUPPORT_EMAIL ?? "[TO SUPPLY: support email (SUPPORT_EMAIL setting)]";
  const rows: [string, React.ReactNode][] = [
    ["Business name", COMPANY.legalName],
    ["Registration", COMPANY.registration],
    [
      "Email",
      isPlaceholder(email) ? (
        email
      ) : (
        <a href={`mailto:${email}`} className="text-primary underline underline-offset-4">
          {email}
        </a>
      ),
    ],
    ["Phone", COMPANY.phone],
    ["Address", COMPANY.address],
    ["Hours", COMPANY.hours],
  ];
  return (
    <>
      <section className="px-4 pt-14 pb-4 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Contact</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Contact us
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          See Propfolio with your own leases, or ask us anything. We answer within one working day.
        </p>
      </section>

      <Section className="pt-8">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div id="demo" className="scroll-mt-24 rounded-3xl border p-6 sm:p-8">
            <h2 className="text-2xl font-semibold">Book a demo</h2>
            <p className="text-muted-foreground mt-1 mb-6">
              30 minutes on a video call, at a time that suits you.
            </p>
            <DemoForm />
          </div>
          <div className="space-y-6">
            <div className="bg-primary-soft rounded-3xl p-6">
              <h2 className="text-xl font-semibold">In your demo</h2>
              <ul className="mt-4 space-y-3">
                {(
                  [
                    { icon: MonitorPlay, text: "A walk-through of reminders, rent and reports" },
                    { icon: CalendarCheck, text: "How to bring in your spreadsheet" },
                    { icon: Clock, text: "Your questions, answered on the spot" },
                  ] as const
                ).map(({ icon: Icon, text }) => (
                  <li key={text} className="flex gap-3">
                    <Icon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border p-6">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Mail className="text-primary size-5" aria-hidden /> Get in touch
              </h2>
              <dl className="mt-4 divide-y">
                {rows.map(([label, value]) => (
                  <div key={label} className="grid gap-1 py-3">
                    <dt className="text-muted-foreground text-sm">{label}</dt>
                    <dd className="font-medium break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-8 max-w-3xl">
          Privacy questions about tenant data in a Propfolio account go first to the lessor who
          keeps that account; they are the personal information controller for it.
        </p>
      </Section>
    </>
  );
}
