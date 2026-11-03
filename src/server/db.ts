import { AsyncLocalStorage } from "node:async_hooks";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * The database client, with customer accounts kept apart by two locks:
 *
 * 1. Every query on an account-owned table gets "accountId = <current account>" added.
 * 2. Every query runs in a transaction that first tells Postgres the account
 *    (`app.account_id`) and switches to the restricted role `propfolio_tenant`, so row-level
 *    security (see the accounts migration) also refuses other accounts' rows.
 *
 * Which account? In a web request, the signed-in person's current account (from their session).
 * Background jobs and sign-in code say so explicitly with `runInAccount`. Code that must work
 * across accounts (sign-in lookups, the platform admin, the worker's account loop) uses
 * `asSystem`. With none of these, queries fail: nothing is ever read "for everyone" by accident.
 *
 * Inside `db.$transaction(async (tx) => …)` always use `tx`: a query on `db` inside the callback
 * runs outside the transaction and keeps only the first lock.
 */

/** Tables whose rows belong to one account (they have an `accountId` column). */
export const ACCOUNT_SCOPED_MODELS = new Set<string>([
  "AuditLog",
  "Setting",
  "Building",
  "UnitType",
  "Unit",
  "Tenant",
  "Lease",
  "LeaseCounter",
  "LeaseDraft",
  "UserPreference",
  "ReminderEvent",
  "ReminderDigest",
  "Charge",
  "Payment",
  "PaymentAllocation",
  "PaymentCounter",
  "Document",
  "Feedback",
  "Membership",
]);

export type DbScope = { kind: "account"; accountId: string } | { kind: "system" };

type Store =
  | (DbScope & { inTx?: boolean })
  | { kind: "request"; accountId?: Promise<string | null>; inTx?: boolean };

const storage = new AsyncLocalStorage<Store>();

/** Thrown when a query has no account to work for. A programming error, never shown as-is. */
export class MissingAccountScopeError extends Error {
  constructor() {
    super("Database query without an account scope");
    this.name = "MissingAccountScopeError";
  }
}

// ─── Choosing the account ────────────────────────────────────────────────────────────────

type Resolver = () => Promise<string | null>;
let requestResolver: Resolver | null = null;

/** Registered by the auth module: the signed-in person's current account, if any. */
export function setRequestAccountResolver(resolver: Resolver): void {
  requestResolver = resolver;
}

// Prisma queries only start when awaited, so each scope awaits `fn` inside itself.

/** Work for one account (background jobs, sign-in, tests). */
export function runInAccount<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ kind: "account", accountId }, async () => await fn());
}

/** Work across accounts. Only for sign-in internals, the platform admin and the worker. */
export function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ kind: "system" }, async () => await fn());
}

/**
 * Wrap a server action or API route: the account is looked up from the session once, on the
 * first query, and reused for the rest of the request.
 */
export function withRequestScope<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ kind: "request" }, async () => await fn());
}

let testScope: DbScope | null = null;
/** Tests only: the scope used when a test calls services directly. */
export function setTestScope(scope: DbScope | null): void {
  if (process.env.NODE_ENV !== "test") throw new Error("setTestScope is for tests only");
  testScope = scope;
}

async function resolveScope(): Promise<DbScope> {
  const store = storage.getStore();
  if (store?.kind === "account" || store?.kind === "system") return store;
  if (store?.kind === "request") {
    store.accountId ??= requestResolver ? requestResolver() : Promise.resolve(null);
    const accountId = await store.accountId;
    if (accountId) return { kind: "account", accountId };
    throw new MissingAccountScopeError();
  }
  if (testScope && process.env.NODE_ENV === "test") return testScope;
  // Pages (server components): the session lookup is memoised per request.
  const accountId = requestResolver ? await requestResolver().catch(() => null) : null;
  if (accountId) return { kind: "account", accountId };
  throw new MissingAccountScopeError();
}

/** The account the current code works for. Throws when there is none. */
export async function currentAccountId(): Promise<string> {
  const scope = await resolveScope();
  if (scope.kind !== "account") throw new MissingAccountScopeError();
  return scope.accountId;
}

// ─── Lock 1: add the account to queries ──────────────────────────────────────────────────

const WHERE_UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);
const WHERE_MANY_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

/** Exported for tests. Creates rely on the column default (the transaction's account). */
export function addAccountFilter(operation: string, args: unknown, accountId: string): unknown {
  const a = { ...((args ?? {}) as Record<string, unknown>) };
  if (WHERE_UNIQUE_OPS.has(operation)) {
    a.where = { ...(a.where as object), accountId };
  } else if (WHERE_MANY_OPS.has(operation)) {
    a.where = a.where ? { AND: [a.where, { accountId }] } : { accountId };
  }
  return a;
}

// ─── Lock 2: row-level security for every transaction ────────────────────────────────────

function setAccountSql(client: PrismaClient | Prisma.TransactionClient, accountId: string) {
  return client.$executeRaw`SELECT set_config('app.account_id', ${accountId}, true), set_config('role', 'propfolio_tenant', true)`;
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };
const base = globalForPrisma.prismaBase ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

const extended = base.$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      const scope = await resolveScope();
      if (scope.kind === "system") return query(args);
      const scopedArgs =
        model && ACCOUNT_SCOPED_MODELS.has(model)
          ? addAccountFilter(operation, args, scope.accountId)
          : args;
      // Inside a transaction the account and role were set when it began.
      if (storage.getStore()?.inTx) return query(scopedArgs as typeof args);
      const [, result] = await base.$transaction([
        setAccountSql(base, scope.accountId),
        query(scopedArgs as typeof args) as Prisma.PrismaPromise<unknown>,
      ]);
      return result;
    },
  },
});

type TxCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;
type TxOptions = Parameters<PrismaClient["$transaction"]>[1];

async function scopedTransaction(arg: unknown, options?: TxOptions): Promise<unknown> {
  const scope = await resolveScope();
  if (Array.isArray(arg)) {
    // Queries in an array were built before the transaction started, so the account can't be
    // set for them. Use the callback form for customer data.
    if (scope.kind !== "system") {
      throw new Error("Use db.$transaction(async (tx) => …) for account data");
    }
    return extended.$transaction(arg as Prisma.PrismaPromise<unknown>[], options);
  }
  const fn = arg as TxCallback<unknown>;
  return extended.$transaction((extendedTx) => {
    // Same client shape; the extension adds no methods of its own.
    const tx = extendedTx as unknown as Prisma.TransactionClient;
    return storage.run({ ...scope, inTx: true }, async () => {
      if (scope.kind === "account") await setAccountSql(tx, scope.accountId);
      return await fn(tx);
    });
  }, options);
}

export const db = new Proxy(extended, {
  get(target, prop, receiver) {
    if (prop === "$transaction") return scopedTransaction;
    return Reflect.get(target, prop, receiver);
  },
}) as unknown as PrismaClient;

export type Tx = Prisma.TransactionClient;
export type DbClient = PrismaClient | Tx;
