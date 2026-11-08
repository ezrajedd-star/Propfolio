import type { Checkout, Plan, Prisma, Subscription } from "@prisma/client";
import { render } from "@react-email/render";
import { z } from "zod";

import { formatPeso } from "@/domain/money/money";
import { PLAN_CONFIG, type PlanName } from "@/domain/plans/plans";
import {
  GRACE_DAYS,
  changeKind,
  displayState,
  graceEnd,
  monthlyPrice,
  nextCharge,
  periodEndFor,
  renewalDue,
  upgradeCharge,
  type DisplayState,
  type PaidPlan,
  type SubscriptionFacts,
} from "@/domain/subscription/subscription";
import {
  addDays,
  daysBetween,
  fromDbDate,
  toDbDate,
  type IsoDate,
} from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { writeAudit } from "@/server/audit";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { asSystem, db } from "@/server/db";
import { isUniqueViolation } from "@/server/db-errors";
import { env } from "@/server/env";
import { ConflictError, ValidationError } from "@/server/errors";
import { SubscriptionEmail } from "@/server/mail/templates/account-emails";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { issuePaymentRecord } from "./invoicing";
import { DEMO_CARD, DEMO_FAILING_CARD, DEMO_PROVIDER, demoWebhook } from "./providers/demo";
import { activeProvider, providerFor } from "./providers";

type Tx = Prisma.TransactionClient;

export interface SubscriptionDeps {
  send: (mail: OutgoingMail, fromName: string) => Promise<void>;
}
const defaultDeps: SubscriptionDeps = { send: deliver };

const appUrl = (path: string) => `${env().APP_URL.replace(/\/$/, "")}${path}`;

function facts(s: Subscription): SubscriptionFacts {
  return {
    plan: s.plan as PaidPlan,
    status: s.status,
    currentPeriodStart: fromDbDate(s.currentPeriodStart),
    currentPeriodEnd: fromDbDate(s.currentPeriodEnd),
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    pendingPlan: (s.pendingPlan as PaidPlan | null) ?? null,
  };
}

const label = (p: PlanName) => PLAN_CONFIG[p].label;

// ─── Emails (to the Owner, who controls the subscription) ─────────────────────────────────

async function emailOwner(
  accountId: string,
  subject: string,
  paragraphs: string[],
  deps: SubscriptionDeps,
  button: { text: string; path: string } = { text: "Open your plan", path: "/plan" },
) {
  try {
    const owner = await asSystem(() =>
      db.membership.findFirst({
        where: { accountId, role: "OWNER", isActive: true },
        select: {
          user: { select: { name: true, email: true } },
          account: { select: { name: true } },
        },
      }),
    );
    if (!owner) return;
    const element = (
      <SubscriptionEmail
        companyName={owner.account.name}
        name={owner.user.name}
        preview={subject}
        paragraphs={paragraphs}
        buttonText={button.text}
        buttonUrl={appUrl(button.path)}
      />
    );
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await deps.send({ to: [owner.user.email], subject, html, text }, "Propfolio");
  } catch (err) {
    // A failed email never undoes a payment; the error type only.
    console.error("[subscription] email not sent:", (err as Error).name);
  }
}

// ─── What the Owner sees ─────────────────────────────────────────────────────────────────

export interface SubscriptionView {
  state: DisplayState;
  subscription: (SubscriptionFacts & { graceEnds: IsoDate | null }) | null;
  nextCharge: ReturnType<typeof nextCharge>;
  canPayOnline: boolean;
  payments: {
    number: string;
    issuedAt: Date;
    description: string;
    amount: string;
    method: string;
  }[];
}

export async function getSubscriptionView(actor: Actor): Promise<SubscriptionView> {
  assertCan(actor, "billing.manage");
  const [sub, payments] = await asSystem(() =>
    Promise.all([
      db.subscription.findUnique({ where: { accountId: actor.accountId } }),
      db.subscriptionInvoice.findMany({
        where: { accountId: actor.accountId },
        orderBy: { issuedAt: "desc" },
        take: 24,
      }),
    ]),
  );
  const f = sub ? facts(sub) : null;
  return {
    state: displayState({
      trialRunning: actor.access.trial !== null,
      subscription: f,
      effectivePlan: actor.access.plan,
    }),
    subscription: f
      ? { ...f, graceEnds: f.status === "PAST_DUE" ? graceEnd(f.currentPeriodEnd) : null }
      : null,
    nextCharge: f ? nextCharge(f) : null,
    canPayOnline: activeProvider() !== null,
    payments: payments.map((p) => ({
      number: p.number,
      issuedAt: p.issuedAt,
      description: p.description,
      amount: p.amount.toFixed(2),
      method: p.method,
    })),
  };
}

// ─── The Owner chooses a plan ─────────────────────────────────────────────────────────────

const choosePlanSchema = z.object({
  plan: z.enum(["PRO", "PREMIUM"], { error: "Choose Pro or Premium." }),
});

export type ChooseResult =
  | { kind: "checkout"; url: string }
  | { kind: "scheduled"; message: string }
  | { kind: "unchanged"; message: string };

/**
 * Upgrade (now: pay the difference for the days left), start a plan (pay the month), pay a
 * renewal that failed, downgrade (from the next period, nothing to pay), or undo a cancellation.
 */
export async function choosePlan(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
  deps: SubscriptionDeps = defaultDeps,
): Promise<ChooseResult> {
  assertCan(actor, "billing.manage");
  const { plan } = parseInput(choosePlanSchema, input);
  const today = manilaToday(now);
  const sub = await asSystem(() =>
    db.subscription.findUnique({ where: { accountId: actor.accountId } }),
  );
  const f = sub ? facts(sub) : null;

  if (f && f.status === "ACTIVE") {
    const kind = changeKind(f.plan, plan);
    if (kind === "downgrade") {
      await asSystem(() =>
        db.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: sub!.id },
            data: { pendingPlan: plan, cancelAtPeriodEnd: false },
          });
          await audit(tx, actor, "subscription.downgrade_scheduled", meta, {
            plan: { before: f.plan, after: plan },
            from: addDays(f.currentPeriodEnd, 1),
          });
        }),
      );
      const from = formatIsoDate(addDays(f.currentPeriodEnd, 1));
      await emailOwner(
        actor.accountId,
        `Your plan changes to ${label(plan)} on ${from}`,
        [
          `You chose ${label(plan)}. You keep ${label(f.plan)} until ${formatIsoDate(f.currentPeriodEnd)}; from ${from} the plan is ${label(plan)} at ${formatPeso(monthlyPrice(plan))} a month.`,
        ],
        deps,
      );
      return { kind: "scheduled", message: `From ${from} your plan will be ${label(plan)}.` };
    }
    if (kind === "same") {
      if (!f.cancelAtPeriodEnd && !f.pendingPlan) {
        return { kind: "unchanged", message: `You're already on ${label(plan)}.` };
      }
      // Undo a cancellation or a waiting downgrade.
      await asSystem(() =>
        db.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: sub!.id },
            data: { cancelAtPeriodEnd: false, pendingPlan: null },
          });
          await audit(tx, actor, "subscription.resumed", meta, { plan: f.plan });
        }),
      );
      return { kind: "scheduled", message: `You'll stay on ${label(plan)}.` };
    }
    // Upgrade in the middle of the period.
    const amount = upgradeCharge(f.plan, plan, today, {
      start: f.currentPeriodStart,
      end: f.currentPeriodEnd,
    });
    return startCheckout(actor, "UPGRADE", plan, amount, now);
  }

  if (f && f.status === "PAST_DUE") {
    // Pay the renewal that failed (for the plan they choose now).
    return startCheckout(actor, "RENEWAL", plan, monthlyPrice(plan), now);
  }
  return startCheckout(actor, "SUBSCRIBE", plan, monthlyPrice(plan), now);
}

async function startCheckout(
  actor: Actor,
  kind: Checkout["kind"],
  plan: PaidPlan,
  amount: string,
  now: Date,
): Promise<ChooseResult> {
  const provider = activeProvider();
  if (!provider) {
    throw new ConflictError(
      "Paying online isn't available yet. Please use the email button on this page to upgrade.",
    );
  }
  const checkout = await asSystem(() =>
    db.checkout.create({
      data: {
        accountId: actor.accountId,
        kind,
        plan,
        amount,
        provider: provider.name,
        createdById: actor.id,
        createdAt: now,
      },
    }),
  );
  const created = await provider.createCheckout({
    checkoutId: checkout.id,
    amount,
    description:
      kind === "UPGRADE"
        ? `Upgrade to Propfolio ${label(plan)}`
        : `Propfolio ${label(plan)}, one month`,
    customerName: actor.name,
    customerEmail: actor.email,
    successUrl: appUrl("/plan?paid=1"),
    cancelUrl: appUrl("/plan"),
  });
  await asSystem(() =>
    db.checkout.update({ where: { id: checkout.id }, data: { providerRef: created.providerRef } }),
  );
  return { kind: "checkout", url: created.url };
}

/** Cancel: nothing more is charged; the plan lasts until the end of the paid period. */
export async function cancelSubscription(
  actor: Actor,
  meta: RequestMeta,
  deps: SubscriptionDeps = defaultDeps,
): Promise<{ until: IsoDate }> {
  assertCan(actor, "billing.manage");
  const sub = await asSystem(() =>
    db.subscription.findUnique({ where: { accountId: actor.accountId } }),
  );
  if (!sub || sub.status !== "ACTIVE") {
    throw new ValidationError("There's no paid plan to cancel.");
  }
  const f = facts(sub);
  if (!f.cancelAtPeriodEnd) {
    await asSystem(() =>
      db.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { cancelAtPeriodEnd: true, pendingPlan: null },
        });
        await audit(tx, actor, "subscription.cancel_scheduled", meta, {
          until: f.currentPeriodEnd,
        });
      }),
    );
    await emailOwner(
      actor.accountId,
      "Your Propfolio plan is cancelled",
      [
        `Nothing more will be charged. You keep ${label(f.plan)} until ${formatIsoDate(f.currentPeriodEnd)}; then your account moves to Free. Nothing is deleted, and you can choose a plan again at any time.`,
      ],
      deps,
    );
  }
  return { until: f.currentPeriodEnd };
}

// ─── Messages from the provider (webhooks) ───────────────────────────────────────────────

export type WebhookOutcome =
  { status: 401 } | { status: 200; result: "duplicate" | "ignored" | "paid" | "failed" };

/**
 * A provider's message. Checked (signature), logged (always), and applied once: a repeated
 * delivery finds its event already logged and changes nothing.
 */
export async function handleProviderWebhook(
  providerName: string,
  rawBody: string,
  headers: Headers,
  now = new Date(),
  deps: SubscriptionDeps = defaultDeps,
): Promise<WebhookOutcome> {
  const provider = providerFor(providerName);
  const msg = provider?.verifyWebhook(rawBody, headers) ?? null;
  if (!provider || !msg) return { status: 401 };

  const checkout = await asSystem(() =>
    db.checkout.findUnique({ where: { providerRef: msg.paymentRef } }),
  );
  let event;
  try {
    event = await asSystem(() =>
      db.providerEvent.create({
        data: {
          provider: provider.name,
          providerEventId: msg.eventId,
          type: msg.type,
          accountId: checkout?.accountId ?? null,
          payload: msg.summary as Prisma.InputJsonValue,
          receivedAt: now,
        },
      }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) return { status: 200, result: "duplicate" };
    throw err;
  }
  const finish = (outcome: string) =>
    asSystem(() =>
      db.providerEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), outcome },
      }),
    );

  if (!checkout || checkout.status !== "OPEN") {
    await finish(
      checkout
        ? `ignored: checkout already ${checkout.status.toLowerCase()}`
        : "ignored: unknown payment",
    );
    return { status: 200, result: "ignored" };
  }
  if (msg.type === "payment.paid") {
    const number = await applyPayment(checkout, msg.method ?? "unknown", now, deps);
    await finish(`paid: ${number}`);
    return { status: 200, result: "paid" };
  }
  await applyFailure(checkout, now, deps);
  await finish("failed");
  return { status: 200, result: "failed" };
}

async function audit(
  tx: Tx,
  actor: Pick<Actor, "id" | "name" | "role" | "accountId"> | null,
  action: string,
  meta: RequestMeta | null,
  metadata: Record<string, unknown>,
  accountId?: string,
) {
  await writeAudit(
    {
      actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
      action,
      entityType: "Subscription",
      entityId: accountId ?? actor?.accountId ?? null,
      metadata,
      meta: meta ?? { ipAddress: null, userAgent: "payment provider" },
      accountId: accountId ?? actor!.accountId,
    },
    tx,
  );
}

/** A payment arrived: grant what the checkout was for, record the payment, tell the Owner. */
async function applyPayment(checkout: Checkout, method: string, now: Date, deps: SubscriptionDeps) {
  const today = manilaToday(now);
  const plan = checkout.plan as PaidPlan;
  const result = await asSystem(() =>
    db.$transaction(async (tx) => {
      // Claim the checkout: two deliveries racing can't both apply it.
      const claimed = await tx.checkout.updateMany({
        where: { id: checkout.id, status: "OPEN" },
        data: { status: "PAID", closedAt: now },
      });
      if (claimed.count !== 1) return null;
      const sub = await tx.subscription.findUnique({ where: { accountId: checkout.accountId } });
      let start: IsoDate;
      let end: IsoDate;
      let grantedPlan: PaidPlan = plan;
      if (checkout.kind === "UPGRADE" && sub && sub.status === "ACTIVE") {
        start = today;
        end = fromDbDate(sub.currentPeriodEnd);
        await tx.subscription.update({ where: { id: sub.id }, data: { plan, pendingPlan: null } });
      } else if (checkout.kind === "RENEWAL" && sub && sub.status !== "CANCELED") {
        grantedPlan =
          sub.status === "PAST_DUE" ? plan : ((sub.pendingPlan ?? sub.plan) as PaidPlan);
        start = addDays(fromDbDate(sub.currentPeriodEnd), 1);
        // A late payment starts the new month today rather than in the past.
        if (start < today && sub.status === "PAST_DUE") start = today;
        end = periodEndFor(start);
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            plan: grantedPlan,
            status: "ACTIVE",
            pendingPlan: null,
            pastDueSince: null,
            graceReminderDay: null,
            currentPeriodStart: toDbDate(start),
            currentPeriodEnd: toDbDate(end),
            ...(method === DEMO_FAILING_CARD || method === DEMO_CARD
              ? { providerRef: method }
              : {}),
          },
        });
      } else {
        // A new subscription (from the trial, Free, or after one ended).
        start = today;
        end = periodEndFor(start);
        const data = {
          plan,
          status: "ACTIVE" as const,
          provider: checkout.provider,
          providerRef: checkout.provider === DEMO_PROVIDER ? method : null,
          currentPeriodStart: toDbDate(start),
          currentPeriodEnd: toDbDate(end),
          cancelAtPeriodEnd: false,
          pendingPlan: null,
          pastDueSince: null,
          graceReminderDay: null,
        };
        await tx.subscription.upsert({
          where: { accountId: checkout.accountId },
          create: { accountId: checkout.accountId, ...data },
          update: data,
        });
      }
      // The plan rules do the rest: plan, and access until the period's last day.
      await tx.account.update({
        where: { id: checkout.accountId },
        data: { plan: grantedPlan, paidUntil: toDbDate(end), trialEndsAt: null },
      });
      const record = await issuePaymentRecord(tx, {
        accountId: checkout.accountId,
        plan: grantedPlan,
        kind: checkout.kind,
        periodStart: start,
        periodEnd: end,
        amount: checkout.amount.toFixed(2),
        method: method.startsWith("demo") ? "demo" : method,
        provider: checkout.provider,
        providerRef: checkout.providerRef,
        checkoutId: checkout.id,
        issuedAt: now,
      });
      await audit(
        tx,
        null,
        "subscription.paid",
        null,
        {
          kind: checkout.kind,
          plan: grantedPlan,
          amount: checkout.amount.toFixed(2),
          paymentRecord: record.number,
          periodEnd: end,
        },
        checkout.accountId,
      );
      return { record, end, grantedPlan };
    }),
  );
  if (!result) return "already applied";
  const { record, end, grantedPlan } = result;
  await emailOwner(
    checkout.accountId,
    `Payment received: ${formatPeso(record.amount.toFixed(2))}`,
    [
      `Thank you. We received ${formatPeso(record.amount.toFixed(2))} for ${record.description} (payment record ${record.number}). Your ${label(grantedPlan)} plan is paid until ${formatIsoDate(end)}.`,
      "This is a payment record, not an official receipt.",
    ],
    deps,
  );
  if (checkout.kind === "UPGRADE") {
    await emailOwner(
      checkout.accountId,
      `Your plan is now ${label(grantedPlan)}`,
      [
        `Everything in ${label(grantedPlan)} is available now. The next monthly charge is on ${formatIsoDate(addDays(end, 1))}.`,
      ],
      deps,
    );
  }
  return record.number;
}

/** A payment failed. For a renewal, the grace period starts; otherwise nothing changes. */
async function applyFailure(checkout: Checkout, now: Date, deps: SubscriptionDeps) {
  const grace = await asSystem(() =>
    db.$transaction(async (tx) => {
      const claimed = await tx.checkout.updateMany({
        where: { id: checkout.id, status: "OPEN" },
        data: { status: "FAILED", closedAt: now },
      });
      if (claimed.count !== 1) return null;
      const sub = await tx.subscription.findUnique({ where: { accountId: checkout.accountId } });
      if (checkout.kind !== "RENEWAL" || !sub || sub.status === "CANCELED") return "none" as const;
      const graceEnds = graceEnd(fromDbDate(sub.currentPeriodEnd));
      if (sub.status === "ACTIVE") {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: "PAST_DUE", pastDueSince: now },
        });
        // Access continues through the grace period.
        await tx.account.update({
          where: { id: checkout.accountId },
          data: { paidUntil: toDbDate(graceEnds) },
        });
      }
      await audit(
        tx,
        null,
        "subscription.payment_failed",
        null,
        { kind: checkout.kind, graceEnds },
        checkout.accountId,
      );
      return graceEnds;
    }),
  );
  if (grace === null) return;
  await emailOwner(
    checkout.accountId,
    "Your Propfolio payment didn't go through",
    grace === "none"
      ? [
          "Your payment didn't go through, so nothing was charged and your plan hasn't changed. You can try again from your plan page.",
        ]
      : [
          `This month's payment didn't go through. You keep your plan until ${formatIsoDate(grace)} (${GRACE_DAYS} days) while you update the payment.`,
          "If it isn't paid by then, your account moves to Free. Nothing is deleted.",
        ],
    deps,
    { text: "Pay now", path: "/plan" },
  );
}

// ─── The daily cycle (worker) ────────────────────────────────────────────────────────────

export interface CycleResult {
  renewalsRequested: number;
  ended: number;
  graceReminders: number;
}

/**
 * Daily: ask for renewals that are due; end cancelled subscriptions after their paid period and
 * past-due ones after the grace period (the account is then on Free under the plan rules);
 * remind past-due Owners on days 3 and 6 of the grace period. Safe to run twice.
 */
export async function runSubscriptionCycle(
  now = new Date(),
  deps: SubscriptionDeps = defaultDeps,
): Promise<CycleResult> {
  const today = manilaToday(now);
  const subs = await asSystem(() =>
    db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, account: { status: "ACTIVE" } },
    }),
  );
  const result: CycleResult = { renewalsRequested: 0, ended: 0, graceReminders: 0 };
  for (const sub of subs) {
    const f = facts(sub);
    if (f.status === "ACTIVE" && f.cancelAtPeriodEnd && today > f.currentPeriodEnd) {
      await endSubscription(sub, "cancelled", deps);
      result.ended++;
      continue;
    }
    if (f.status === "ACTIVE" && renewalDue(f, today)) {
      if (await requestRenewal(sub, now)) result.renewalsRequested++;
      continue;
    }
    if (f.status === "PAST_DUE") {
      const ends = graceEnd(f.currentPeriodEnd);
      if (today > ends) {
        await endSubscription(sub, "unpaid", deps);
        result.ended++;
        continue;
      }
      const day = daysBetween(f.currentPeriodEnd, today);
      const due = [3, 6].filter((d) => day >= d && (sub.graceReminderDay ?? 0) < d).pop();
      if (due) {
        await asSystem(() =>
          db.subscription.update({ where: { id: sub.id }, data: { graceReminderDay: due } }),
        );
        await emailOwner(
          sub.accountId,
          "Reminder: your Propfolio payment is still due",
          [
            `This month's payment hasn't gone through yet. You keep your plan until ${formatIsoDate(ends)}; after that your account moves to Free. Nothing is deleted.`,
          ],
          deps,
          { text: "Pay now", path: "/plan" },
        );
        result.graceReminders++;
      }
    }
  }
  return result;
}

/** One renewal request per period: an open renewal checkout means it was already asked for. */
async function requestRenewal(sub: Subscription, now: Date): Promise<boolean> {
  const provider = providerFor(sub.provider);
  if (!provider) return false;
  const f = facts(sub);
  const plan = f.pendingPlan ?? f.plan;
  const open = await asSystem(() =>
    db.checkout.count({
      where: {
        accountId: sub.accountId,
        kind: "RENEWAL",
        createdAt: { gte: toDbDate(f.currentPeriodEnd) },
      },
    }),
  );
  if (open > 0) return false;
  const checkout = await asSystem(() =>
    db.checkout.create({
      data: {
        accountId: sub.accountId,
        kind: "RENEWAL",
        plan,
        amount: monthlyPrice(plan),
        provider: provider.name,
        createdAt: now,
      },
    }),
  );
  const { providerRef } = await provider.requestRenewal({
    checkoutId: checkout.id,
    amount: monthlyPrice(plan),
    description: `Propfolio ${label(plan)}, one month`,
    subscriptionRef: sub.providerRef,
  });
  await asSystem(() => db.checkout.update({ where: { id: checkout.id }, data: { providerRef } }));
  // The demo "card" answers at once, through the same webhook handling as a real provider.
  if (provider.name === DEMO_PROVIDER) {
    const fails = sub.providerRef === DEMO_FAILING_CARD;
    const hook = demoWebhook(
      fails ? "payment.failed" : "payment.paid",
      providerRef,
      sub.providerRef,
    );
    await handleProviderWebhook(DEMO_PROVIDER, hook.raw, hook.headers, now);
  }
  return true;
}

async function endSubscription(
  sub: Subscription,
  why: "cancelled" | "unpaid",
  deps: SubscriptionDeps,
) {
  const changed = await asSystem(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({
        where: { id: sub.id, status: { not: "CANCELED" } },
        data: { status: "CANCELED", cancelAtPeriodEnd: false, pendingPlan: null },
      });
      if (count === 1) {
        await audit(
          tx,
          null,
          "subscription.ended",
          null,
          { reason: why, plan: sub.plan },
          sub.accountId,
        );
      }
      return count === 1;
    }),
  );
  if (!changed) return;
  await emailOwner(
    sub.accountId,
    "Your Propfolio account is now on Free",
    [
      why === "cancelled"
        ? "Your paid plan has ended, as you chose."
        : "This month's payment didn't go through in time, so your paid plan has ended.",
      "Nothing is deleted: everything stays visible, and exports and the privacy tools keep working. With more than 3 units the account is read-only, and your team's sign-ins are paused until you choose a plan again. Upgrading gives everything back straight away.",
    ],
    deps,
    { text: "Choose a plan", path: "/plan" },
  );
}

/** The demo checkout page: what is being paid for (the Owner's own checkouts only). */
export async function getDemoCheckout(actor: Actor, providerRef: string) {
  assertCan(actor, "billing.manage");
  const c = await asSystem(() => db.checkout.findUnique({ where: { providerRef } }));
  if (!c || c.accountId !== actor.accountId || c.provider !== DEMO_PROVIDER) return null;
  return { status: c.status, plan: c.plan as Plan, amount: c.amount.toFixed(2), kind: c.kind };
}

const demoPaySchema = z.object({
  outcome: z.enum(["card", "gcash", "maya", "card-renewals-fail", "fail"]),
});

/** The demo checkout's buttons: pay (by a pretend method) or fail, as a provider would report. */
export async function payDemoCheckout(
  actor: Actor,
  providerRef: string,
  input: unknown,
  now = new Date(),
): Promise<WebhookOutcome> {
  assertCan(actor, "billing.manage");
  const { outcome } = parseInput(demoPaySchema, input);
  const c = await getDemoCheckout(actor, providerRef);
  if (!c) throw new ValidationError("We couldn't find that payment.");
  const method =
    outcome === "card" ? DEMO_CARD : outcome === "card-renewals-fail" ? DEMO_FAILING_CARD : outcome;
  const hook = demoWebhook(
    outcome === "fail" ? "payment.failed" : "payment.paid",
    providerRef,
    method,
  );
  return handleProviderWebhook(DEMO_PROVIDER, hook.raw, hook.headers, now);
}

// ─── For the platform admin (bookkeeper export) ──────────────────────────────────────────

export async function listPaymentRecords(range: { from: IsoDate; to: IsoDate }) {
  return asSystem(() =>
    db.subscriptionInvoice.findMany({
      where: {
        issuedAt: {
          gte: new Date(`${range.from}T00:00:00+08:00`),
          lte: new Date(`${range.to}T23:59:59.999+08:00`),
        },
      },
      orderBy: { issuedAt: "asc" },
    }),
  );
}
