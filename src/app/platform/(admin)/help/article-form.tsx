"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Eye, Loader2, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Field, fieldAria } from "@/components/form/field";
import { useActionForm } from "@/components/platform/use-action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { HELP_CATEGORIES } from "@/domain/help/articles";
import { TICKET_LANGUAGES, TICKET_LANGUAGE_LABELS } from "@/domain/tickets/tickets";
import { helpArticleSchema } from "@/schemas/help";
import { saveArticleAction, setArticleStatusAction } from "../../actions";

type Values = z.input<typeof helpArticleSchema>;

export function ArticleForm({ id, initial }: { id: string | null; initial: Values }) {
  const form = useForm<Values>({
    resolver: zodResolver(helpArticleSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const { pending, onSubmit } = useActionForm(
    form,
    (v) => saveArticleAction(id, v),
    id ? "Saved ✓" : null,
    id ? form.getValues() : initial,
  );
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field id="a-title" label="Title" required error={errors.title?.message}>
        <Input {...fieldAria("a-title", errors.title?.message)} {...form.register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="a-category" label="Category" required error={errors.category?.message}>
          <NativeSelect id="a-category" {...form.register("category")}>
            {HELP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="a-language" label="Language">
          <NativeSelect id="a-language" {...form.register("language")}>
            {TICKET_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {TICKET_LANGUAGE_LABELS[l]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field
        id="a-body"
        label="Article"
        required
        error={errors.body?.message}
        hint='Blank line between paragraphs. Start a line with "- " for a list, "## " for a heading.'
      >
        <Textarea
          {...fieldAria("a-body", errors.body?.message)}
          rows={16}
          {...form.register("body")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {id ? "Save changes" : "Save as a draft"}
      </Button>
    </form>
  );
}

export function ArticleStatusButtons({
  id,
  status,
  slug,
}: {
  id: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  slug: string;
}) {
  const [pending, start] = useTransition();
  const set = (next: "DRAFT" | "PUBLISHED" | "ARCHIVED", done: string) =>
    start(async () => {
      const r = await setArticleStatusAction(id, next);
      if (r.ok) toast.success(done);
      else toast.error(r.message);
    });
  return (
    <div className="flex flex-wrap gap-3">
      {status !== "PUBLISHED" ? (
        <Button type="button" disabled={pending} onClick={() => set("PUBLISHED", "Published ✓")}>
          <Eye aria-hidden /> Publish
        </Button>
      ) : (
        <Button asChild variant="outline">
          <a href={`/help/articles/${slug}`} target="_blank" rel="noreferrer">
            <Eye aria-hidden /> See it on the website
          </a>
        </Button>
      )}
      {status === "PUBLISHED" ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => set("DRAFT", "Back to draft ✓")}
        >
          <Undo2 aria-hidden /> Unpublish
        </Button>
      ) : null}
      {status !== "ARCHIVED" ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => set("ARCHIVED", "Archived ✓")}
        >
          <Archive aria-hidden /> Archive
        </Button>
      ) : null}
    </div>
  );
}
