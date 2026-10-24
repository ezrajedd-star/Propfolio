"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type Resolver,
} from "react-hook-form";
import type { z } from "zod";

type Result = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * React Hook Form + Zod (the same schema the server uses) + a server action. Server-side field
 * errors are shown next to the right fields; other errors appear in `error`.
 */
export function useActionForm<S extends z.ZodType<unknown, FieldValues>>(
  schema: S,
  defaultValues: DefaultValues<z.input<S>>,
  submit: (values: z.input<S>) => Promise<Result>,
) {
  type V = z.input<S>;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<V>({
    resolver: zodResolver(schema as never) as unknown as Resolver<V>,
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await submit(values);
      if (!result.ok) {
        setError(result.message);
        for (const [k, v] of Object.entries(result.fieldErrors ?? {}))
          form.setError(k as Path<V>, { message: v });
      }
    });
  });

  return { form, error, setError, pending, onSubmit, errors: form.formState.errors };
}
