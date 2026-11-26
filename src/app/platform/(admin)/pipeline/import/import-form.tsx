"use client";

import { FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importLeadsAction } from "../../../actions";

type Result = { created: number; skipped: number; errors: { row: number; error: string }[] };

export function ImportLeadsForm() {
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        action={(form) =>
          start(async () => {
            const r = await importLeadsAction(form);
            if (r.ok) {
              setResult(r.data);
              setMessage(null);
            } else {
              setResult(null);
              setMessage(r.message);
            }
          })
        }
      >
        {message ? <FormAlert>{message}</FormAlert> : null}
        <div className="space-y-2">
          <Label htmlFor="file">Spreadsheet (.xlsx or .csv)</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx,.csv"
            className="block min-h-10 text-base"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
          Import
        </Button>
      </form>
      {result ? (
        result.errors.length ? (
          <div role="alert" className="space-y-2">
            <p className="font-medium">
              Nothing was imported. Fix these rows in the spreadsheet and import it again:
            </p>
            <ul className="list-disc space-y-1 pl-6">
              {result.errors.slice(0, 50).map((e) => (
                <li key={e.row}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
            {result.errors.length > 50 ? <p>…and {result.errors.length - 50} more.</p> : null}
          </div>
        ) : (
          <div role="status" className="space-y-2">
            <p className="font-medium">
              Imported {result.created} lead{result.created === 1 ? "" : "s"} ✓
              {result.skipped ? ` (${result.skipped} already in the pipeline, skipped)` : ""}
            </p>
            <Button asChild variant="outline">
              <Link href="/platform/pipeline?view=list">See them in the list</Link>
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
