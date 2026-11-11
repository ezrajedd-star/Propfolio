import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { VALUE_PROPOSITION } from "@/domain/marketing/content";

/** The closing call to action on every page. */
export function CtaBand({
  title = "Stop tracking leases in spreadsheets.",
  text = VALUE_PROPOSITION.primaryNote,
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="px-4 pb-20">
      <div className="bg-primary text-primary-foreground relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-2xl"
        />
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-lg opacity-90">{text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link href="/signup">
              {VALUE_PROPOSITION.primaryCta} <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/contact#demo">{VALUE_PROPOSITION.secondaryCta}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
