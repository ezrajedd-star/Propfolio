"use client";

import { useTransition } from "react";
import type { Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import type { ActionResult } from "@/server/actions";

/** Submit a react-hook-form form to a server action: toast, field errors, reset on success. */
export function useActionForm<V extends Record<string, unknown>, T = unknown>(
  form: UseFormReturn<V>,
  run: (values: V) => Promise<ActionResult<T>>,
  done: string | null,
  reset: V,
  onDone?: (data: T, values: V) => void,
) {
  const [pending, start] = useTransition();
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const r = await run(values);
      if (r.ok) {
        if (done) toast.success(done);
        form.reset(reset);
        onDone?.(r.data, values);
      } else {
        toast.error(r.message);
        for (const [k, v] of Object.entries(r.fieldErrors ?? {})) {
          form.setError(k as Path<V>, { message: v });
        }
      }
    }),
  );
  return { pending, onSubmit };
}
