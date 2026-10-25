"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/** A dropdown filter that updates the page address (so filters survive reloads and links). */
export function FilterSelect({
  param,
  label,
  allLabel,
  options,
}: {
  param: string;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = `filter-${param}`;
  return (
    <div className="w-full space-y-1.5 sm:w-56">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={params.get(param) ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set(param, e.target.value);
          else next.delete(param);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
