import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A plain GET search form that keeps other filters as hidden fields. */
export function SearchBox({
  defaultValue,
  placeholder,
  keep = {},
  label = "Search",
}: {
  defaultValue?: string;
  placeholder: string;
  keep?: Record<string, string | undefined>;
  label?: string;
}) {
  return (
    <form role="search" className="flex w-full max-w-xl gap-2">
      <label htmlFor="q" className="sr-only">
        {label}
      </label>
      <div className="relative flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="pl-10"
        />
      </div>
      {Object.entries(keep).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
