import { z } from "zod";

import { HELP_CATEGORIES } from "@/domain/help/articles";
import { TICKET_LANGUAGES } from "@/domain/tickets/tickets";

export const helpArticleSchema = z.object({
  title: z.string().trim().min(5, "Give it a title.").max(150),
  body: z.string().trim().min(20, "Write the article (at least a sentence or two).").max(20_000),
  category: z.enum(HELP_CATEGORIES, { error: "Choose a category." }),
  language: z.enum(TICKET_LANGUAGES).default("EN"),
});
