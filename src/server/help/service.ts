import type { HelpArticleStatus, TicketLanguage } from "@prisma/client";

import {
  HELP_CATEGORIES,
  excerpt,
  searchScore,
  searchTerms,
  slugify,
} from "@/domain/help/articles";
import { helpArticleSchema } from "@/schemas/help";
import { FAQ } from "@/domain/marketing/content";
import { asSystem, db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { env } from "@/server/env";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

/**
 * The public help centre. Staff write and publish articles in the console; the Support agent
 * answers from published ones and proposes new ones through the approval inbox.
 */

// ─── Public ──────────────────────────────────────────────────────────────────────────────

export async function listPublishedArticles(opts: { q?: string } = {}) {
  const rows = await asSystem(() =>
    db.helpArticle.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      select: { slug: true, title: true, body: true, category: true, language: true },
    }),
  );
  const terms = opts.q ? searchTerms(opts.q) : [];
  const shown = terms.length
    ? rows
        .map((r) => ({ r, score: searchScore(r, terms) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.r)
    : rows;
  return shown.map((r) => ({ ...r, excerpt: excerpt(r.body), body: undefined }));
}

export async function getPublishedArticle(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return asSystem(() => db.helpArticle.findFirst({ where: { slug, status: "PUBLISHED" } }));
}

/** For the Support agent: the best matches among published articles and the website FAQ. */
export async function searchHelpForAgent(q: string, language?: TicketLanguage) {
  const terms = searchTerms(q);
  if (terms.length === 0) return [];
  const rows = await asSystem(() =>
    db.helpArticle.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, title: true, body: true, language: true },
    }),
  );
  const base = env().APP_URL;
  const sources = [
    ...rows.map((r) => ({
      title: r.title,
      body: r.body,
      language: r.language as string,
      url: `${base}/help/articles/${r.slug}`,
    })),
    ...FAQ.map((f) => ({ title: f.q, body: f.a, language: "EN", url: `${base}/help` })),
  ];
  return sources
    .map((r) => ({
      r,
      score: searchScore(r, terms) + (language && r.language === language ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ r }) => ({
      title: r.title,
      language: r.language,
      url: r.url,
      text: r.body.slice(0, 4000),
    }));
}

// ─── Console ─────────────────────────────────────────────────────────────────────────────

export async function listArticles(admin: PlatformActor) {
  assertPlatformCan(admin, "console.view");
  return asSystem(() =>
    db.helpArticle.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] }),
  );
}

export async function getArticle(admin: PlatformActor, id: string) {
  assertPlatformCan(admin, "console.view");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that article.");
  const a = await asSystem(() => db.helpArticle.findUnique({ where: { id } }));
  if (!a) throw new NotFoundError("We couldn't find that article.");
  return a;
}

async function uniqueSlug(title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db.helpArticle.findUnique({ where: { slug } });
    if (!taken || taken.id === exceptId) return slug;
  }
  throw new ValidationError("Choose a more distinctive title.");
}

export async function saveArticle(
  admin: PlatformActor,
  id: string | null,
  input: unknown,
  meta: RequestMeta,
) {
  assertPlatformCan(admin, "help.manage");
  const data = parseInput(helpArticleSchema, input);
  return asSystem(() =>
    db.$transaction(async (tx) => {
      if (id && !isUuid(id)) throw new NotFoundError("We couldn't find that article.");
      const before = id ? await tx.helpArticle.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundError("We couldn't find that article.");
      const slug =
        before?.status === "PUBLISHED"
          ? before.slug
          : await uniqueSlug(data.title, id ?? undefined);
      const a = before
        ? await tx.helpArticle.update({
            where: { id: before.id },
            data: { ...data, slug, updatedById: admin.id },
          })
        : await tx.helpArticle.create({ data: { ...data, slug, updatedById: admin.id } });
      await writeStaffLog(
        {
          actor: admin,
          kind: "CHANGE",
          action: before ? "help.article_updated" : "help.article_created",
          entityType: "HelpArticle",
          entityId: a.id,
          meta,
        },
        tx,
      );
      return a;
    }),
  );
}

export async function setArticleStatus(
  admin: PlatformActor,
  id: string,
  status: HelpArticleStatus,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "help.manage");
  if (!isUuid(id)) throw new NotFoundError("We couldn't find that article.");
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const a = await tx.helpArticle.findUnique({ where: { id } });
      if (!a) throw new NotFoundError("We couldn't find that article.");
      await tx.helpArticle.update({
        where: { id },
        data: {
          status,
          ...(status === "PUBLISHED" && !a.publishedAt ? { publishedAt: now } : {}),
          updatedById: admin.id,
        },
      });
      await writeStaffLog(
        {
          actor: admin,
          kind: "CHANGE",
          action: `help.article_${status.toLowerCase()}`,
          entityType: "HelpArticle",
          entityId: id,
          meta,
        },
        tx,
      );
    }),
  );
}

/** Executor for an approved article proposal from the Support agent: published straight away. */
export async function publishArticleFromAgent(
  p: Record<string, unknown>,
  approvedByName: string | null,
  now = new Date(),
): Promise<string> {
  const data = parseInput(helpArticleSchema, {
    title: p.title,
    body: p.body,
    category: HELP_CATEGORIES.includes(p.category as never) ? p.category : "Getting started",
    language: p.language ?? "EN",
  });
  const a = await asSystem(async () =>
    db.helpArticle.create({
      data: {
        ...data,
        slug: await uniqueSlug(data.title),
        status: "PUBLISHED",
        source: "agent",
        publishedAt: now,
      },
    }),
  );
  return `Article published at /help/articles/${a.slug}${approvedByName ? ` (approved by ${approvedByName})` : ""}`;
}
