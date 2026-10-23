# CLAUDE.md — Propfolio

Lease ledger for a Philippine leasing company. The full brief is in `docs/brief.md`; deviations
are in `docs/decisions.md`. Build proceeds in the 7 phases listed in the README; at the end of
each phase run all tests, summarise what was built and list open questions.

## Rules

- **Ease of use first.** Plain words ("Lease ends in 45 days"), one primary action per screen,
  ≥16px text, ≥40px click targets, colour always paired with a label or icon, confirm
  destructive actions, offer Undo, archive instead of delete.
- **Authorization on the server, always.** Every service function calls `assertCan(actor, …)`;
  every page calls `requirePageUser(permission)`; every action/route calls `requireActor(permission)`.
  Viewers must never receive tenant contact, financial or document fields from any API.
- **Audit** every create/update/archive, sign-in, export, download and privacy action via
  `writeAudit` inside the same transaction. Never put passwords, tokens or hashes in it.
- **No PII in logs** (no emails, names, request bodies). Log error types and counts.
- **Money:** `Decimal(14,2)` in Postgres, decimal.js in code. Never floats.
- **Dates:** instants are `timestamptz` (UTC); business dates are `date` in Asia/Manila
  (`src/domain/time/manila.ts`). Display `23 Oct 2026`, currency `₱12,500.00`.
- **IDs:** UUIDv7 (`@default(uuid(7))`).
- Posted financial records are never edited or deleted: void/reverse with a reason.
- `src/domain` is pure (no I/O), table-driven tests, ≥ 80 % coverage. Services take an
  injectable `now` for testability.
- Same Zod schema (`src/schemas`) validates the form and the server.
- Pin exact dependency versions.

## Commands

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
pnpm build && pnpm test:e2e
```
