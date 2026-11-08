import type { Metadata } from "next";

import { COMPANY, isPlaceholder } from "@/domain/legal/company";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Contact" };

export const dynamic = "force-dynamic";

/** How to reach Propfolio (business details from src/domain/legal/company.ts). */
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
    <article className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold">Contact us</h1>
      <p className="text-muted-foreground mt-2">
        Questions about Propfolio, your plan or a payment: we answer within one working day.
      </p>
      <dl className="mt-8 divide-y rounded-xl border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 p-4 sm:grid-cols-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-6">
        Privacy questions about tenant data in a Propfolio account go first to the lessor who keeps
        that account; they are the personal information controller for it.
      </p>
    </article>
  );
}
