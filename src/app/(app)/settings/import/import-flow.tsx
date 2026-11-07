"use client";

import { CircleCheck, Download, FileUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ImportError } from "@/domain/import/rows";

type Counts = Record<"Buildings" | "Units" | "Tenants" | "Leases", number>;
type CheckResponse =
  | { ok: true; counts: Counts }
  | { ok: false; errors: ImportError[] }
  | { error: { message: string } };
type RunResponse =
  | { ok: true; summary: { buildings: number; units: number; tenants: number; leases: number } }
  | { ok: false; errors: ImportError[] }
  | { error: { message: string } };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function upload(file: File, mode: "check" | "run") {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch(`/api/v1/import?mode=${mode}`, { method: "POST", body });
  return (await res.json()) as CheckResponse & RunResponse;
}

export function ImportFlow() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<ImportError[] | null>(null);
  const [ready, setReady] = useState<Counts | null>(null);
  const [done, setDone] = useState<{
    buildings: number;
    units: number;
    tenants: number;
    leases: number;
  } | null>(null);

  const reset = (f: File | null) => {
    setFile(f);
    setProblem(null);
    setErrors(null);
    setReady(null);
    setDone(null);
  };

  const check = () =>
    file &&
    start(async () => {
      const r = await upload(file, "check").catch(() => null);
      if (!r)
        return setProblem("We couldn't reach Propfolio. Check your connection and try again.");
      if ("error" in r) return setProblem(r.error.message);
      if (r.ok && "counts" in r) setReady(r.counts);
      else if (!r.ok) setErrors(r.errors);
    });

  const run = () =>
    file &&
    start(async () => {
      const r = await upload(file, "run").catch(() => null);
      if (!r)
        return setProblem("We couldn't reach Propfolio. Check your connection and try again.");
      if ("error" in r) return setProblem(r.error.message);
      if (r.ok && "summary" in r) {
        setReady(null);
        setDone(r.summary);
        toast.success("Import finished ✓");
      } else if (!r.ok) {
        setReady(null);
        setErrors(r.errors);
      }
    });

  if (done) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="space-y-4 py-6">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheck className="text-success size-6" aria-hidden /> Imported
          </p>
          <p>
            {plural(done.buildings, "building", "buildings")}, {plural(done.units, "unit", "units")}
            , {plural(done.tenants, "tenant", "tenants")} and{" "}
            {plural(done.leases, "lease", "leases")} were added. Rent schedules and reminders were
            set up for each lease.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/leases">See your leases</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/units">See your units</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Download the template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">
            One sheet each for buildings, units, tenants and leases (with rent, yearly increase,
            deposit and advance rent). The &ldquo;Read me&rdquo; sheet explains every column.
          </p>
          <Button variant="outline" asChild>
            <a href="/api/v1/import/template">
              <Download aria-hidden /> Download the template
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Upload your filled-in file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={input}
            id="import-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => reset(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor="import-file"
            className="hover:bg-muted/50 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center"
          >
            <FileUp className="text-primary size-6" aria-hidden />
            {file ? (
              <span className="font-medium">{file.name}</span>
            ) : (
              <span>Click to choose your Excel file (.xlsx, up to 2 MB)</span>
            )}
          </label>
          {problem ? <FormAlert>{problem}</FormAlert> : null}
          {!ready ? (
            <Button size="lg" disabled={!file || pending} onClick={check}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {pending ? "Checking every row…" : "Check the file"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {ready ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Ready to import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="flex items-start gap-2">
              <CircleCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
              Every row is fine. This adds {plural(ready.Buildings, "building", "buildings")},{" "}
              {plural(ready.Units, "unit", "units")}, {plural(ready.Tenants, "tenant", "tenants")}{" "}
              and {plural(ready.Leases, "lease", "leases")}.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" disabled={pending} onClick={run}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {pending ? "Importing…" : "Import now"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => reset(file)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {errors ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {plural(errors.length, "thing", "things")} to fix. Nothing was saved.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              Fix these in your Excel file, save it, then choose it again above.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Row</TableHead>
                    <TableHead>What to fix</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.sheet ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{e.row ?? "—"}</TableCell>
                      <TableCell className="whitespace-normal">{e.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
