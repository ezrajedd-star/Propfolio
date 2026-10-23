"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

/** Password input with a Show/Hide toggle so people can check what they typed. */
export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-24" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-1.5 inline-flex h-8 -translate-y-1/2 items-center gap-1.5 rounded px-2 text-sm font-medium"
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
