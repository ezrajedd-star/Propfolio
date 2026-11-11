"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { FaqList } from "@/components/marketing/faq-list";
import { Input } from "@/components/ui/input";
import type { FaqItem } from "@/domain/marketing/content";

/** Search the questions as you type, grouped by topic. */
export function FaqSearch({ items }: { items: FaqItem[] }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((f) => {
    const text = `${f.q} ${f.a} ${f.category}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const categories = [...new Set(shown.map((f) => f.category))];

  return (
    <div>
      <div className="relative mx-auto max-w-2xl">
        <Search
          className="text-muted-foreground absolute top-1/2 left-4 size-5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search, e.g. import, GCash, privacy"
          aria-label="Search the help centre"
          className="h-14 rounded-full pl-12 text-lg"
        />
      </div>
      <p aria-live="polite" className="text-muted-foreground mt-4 text-center">
        {words.length > 0
          ? `${shown.length} ${shown.length === 1 ? "answer" : "answers"} found`
          : `${items.length} answers`}
      </p>
      <div className="mt-8 space-y-10">
        {categories.map((c) => (
          <section key={c} aria-labelledby={`cat-${c}`}>
            <h2 id={`cat-${c}`} className="mb-4 text-2xl font-semibold">
              {c}
            </h2>
            <FaqList items={shown.filter((f) => f.category === c)} />
          </section>
        ))}
        {shown.length === 0 ? (
          <p className="rounded-2xl border p-6 text-center text-lg">
            No answer matches “{q.trim()}”. Try other words, or ask us below.
          </p>
        ) : null}
      </div>
    </div>
  );
}
