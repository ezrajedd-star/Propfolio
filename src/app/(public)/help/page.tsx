import { BookOpen, CalendarCheck, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { Section } from "@/components/marketing/section";
import { FAQ } from "@/domain/marketing/content";
import { FaqSearch } from "./faq-search";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Answers about getting started, plans and payments, your data and using Propfolio.",
};

export default function HelpPage() {
  return (
    <>
      <section className="from-primary-soft bg-gradient-to-b to-transparent px-4 pt-14 pb-6 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Help centre</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          How can we help?
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          Plain answers to the questions lessors ask most.
        </p>
      </section>
      <Section className="pt-6">
        <div className="mx-auto max-w-3xl">
          <FaqSearch items={FAQ} />
        </div>
      </Section>
      <Section title="Still stuck?" className="bg-muted/40">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Mail,
              title: "Email us",
              text: "We answer within one working day.",
              href: "/contact",
              cta: "Contact us",
            },
            {
              icon: CalendarCheck,
              title: "Book a demo",
              text: "A 30-minute walk-through with your own questions.",
              href: "/contact#demo",
              cta: "Book a demo",
            },
            {
              icon: BookOpen,
              title: "Inside Propfolio",
              text: "Signed in? The Getting started list on your home page walks you through set-up.",
              href: "/login",
              cta: "Sign in",
            },
          ].map((c) => (
            <div key={c.title} className="bg-card flex flex-col rounded-2xl border p-6">
              <c.icon className="text-primary size-6" aria-hidden />
              <h3 className="mt-3 text-xl font-semibold">{c.title}</h3>
              <p className="text-muted-foreground mt-1 flex-1">{c.text}</p>
              <Link
                href={c.href}
                className="text-primary mt-4 inline-flex min-h-10 items-center font-semibold underline-offset-4 hover:underline"
              >
                {c.cta}
              </Link>
            </div>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
