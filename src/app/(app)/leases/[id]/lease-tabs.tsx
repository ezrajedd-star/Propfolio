"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LeaseTabs({
  tabs,
  initial,
}: {
  tabs: { value: string; label: string; content: ReactNode }[];
  initial?: string;
}) {
  return (
    <Tabs defaultValue={tabs.some((t) => t.value === initial) ? initial : tabs[0]!.value}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
