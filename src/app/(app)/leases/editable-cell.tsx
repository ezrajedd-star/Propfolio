"use client";

import { Loader2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Kind = "text" | "day";

function validate(kind: Kind, raw: string): string | null {
  if (kind === "day") {
    if (!/^\d+$/.test(raw.trim())) return "Enter a day from 1 to 28.";
    const n = Number(raw);
    if (n < 1 || n > 28) return "Use a day from 1 to 28, so it exists in every month.";
  } else if (raw.length > 2000) {
    return "Keep this under 2,000 characters.";
  }
  return null;
}

/**
 * A grid cell you can edit in place. Click (or press Enter) to edit; Enter or leaving the
 * field saves; Escape cancels. Problems are shown right under the field.
 */
export function EditableCell({
  value,
  kind = "text",
  label,
  disabled,
  onSave,
}: {
  value: string | number | null;
  kind?: Kind;
  /** e.g. "remarks for LSE-2026-0001", used for the screen-reader label. */
  label: string;
  disabled?: boolean;
  onSave: (value: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = value === null || value === "" ? null : String(value);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const start = () => {
    if (disabled) return;
    setDraft(display ?? "");
    setError(null);
    setEditing(true);
  };

  const commit = async () => {
    if (saving) return;
    const next = draft.trim();
    if (next === (display ?? "")) {
      setEditing(false);
      return;
    }
    const problem = validate(kind, next);
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    const r = await onSave(next);
    setSaving(false);
    if (r.ok) {
      setEditing(false);
      setError(null);
    } else {
      setError(r.message ?? "That didn't save. Please try again.");
      inputRef.current?.focus();
    }
  };

  if (editing) {
    return (
      <div className="min-w-32">
        <div className="relative">
          <input
            ref={inputRef}
            aria-label={`Edit ${label}`}
            aria-invalid={error ? true : undefined}
            inputMode={kind === "day" ? "numeric" : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                setError(null);
              }
            }}
            className={cn(
              "bg-card h-10 w-full rounded-md border px-2 text-base shadow-xs",
              kind === "day" && "w-20",
              error ? "border-destructive" : "border-primary",
            )}
          />
          {saving ? (
            <Loader2
              className="text-muted-foreground absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin"
              aria-hidden
            />
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-destructive mt-1 max-w-56 text-sm font-medium">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">Enter to save · Esc to cancel</p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label={`${display ?? "Empty"}. Edit ${label}`}
      className={cn(
        "group hover:bg-muted flex min-h-10 w-full max-w-64 items-center gap-2 rounded-md px-2 text-left disabled:cursor-default disabled:hover:bg-transparent",
        !display && "text-muted-foreground",
      )}
    >
      <span className="line-clamp-2 min-w-0 flex-1">{display ?? (disabled ? "—" : "Add…")}</span>
      {!disabled ? (
        <Pencil
          className="size-3.5 shrink-0 opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
