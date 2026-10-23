# Propfolio

A lease ledger for rental property companies in the Philippines. It replaces an old
"Contract Scheduler" with one place for buildings, units, tenants, leases, rent schedules,
payments, documents, reminders and reports. It is designed first for **ease of use** by a busy,
non-technical Leasing team, and to meet the **Data Privacy Act of 2012 (RA 10173)**.

> **Status:** Phase 1 (Foundation) of 7 is complete: sign-in, roles, user management, audit
> log, layout and design system. See [Build phases](#build-phases).

---

## Quick start (local development)

Requirements: Node.js 22+, pnpm 10, PostgreSQL 16 (or Docker).

```bash
pnpm install
cp .env.example .env              # then set MAIL_TRANSPORT=log if you have no SMTP server

# Database: either use your own Postgres, or start one (plus Mailpit) with Docker:
docker compose up -d postgres mailpit

pnpm db:migrate                   # apply migrations
pnpm db:seed                      # synthetic users; prints their generated passwords
pnpm dev                          # app on http://localhost:3000
pnpm worker:dev                   # background jobs (separate terminal)
```

Seed users (synthetic, `.test` domain) are `admin@propfolio.test`, `leasing@propfolio.test`
and `viewer@propfolio.test`. Their passwords are **generated on every seed run** and printed to
the terminal. Set `SEED_PASSWORD` in `.env` if you want one fixed local password.

### Everything in Docker

```bash
cp .env.example .env              # set POSTGRES_PASSWORD at least
docker compose up --build         # postgres, mailpit, migrate (one-off), web, worker
docker compose run --rm migrate pnpm db:seed
```

The app is on http://localhost:3000 and test emails are at http://localhost:8025 (Mailpit).

### Testing email locally

With `MAIL_TRANSPORT=smtp` and the default `SMTP_HOST=localhost` / `SMTP_PORT=1025`, every email
(password links, change notifications and, later, reminder digests) goes to **Mailpit**. Open
http://localhost:8025 to read them. Nothing leaves your machine.

With `MAIL_TRANSPORT=log`, emails are not sent at all. Only the subject and the number of
recipients are logged, never addresses or contents.

---

## Environment variables

| Variable                                                              | Required     | Description                                                                                                                                 |
| --------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                        | yes          | PostgreSQL connection string. Use `?sslmode=require` for managed databases.                                                                 |
| `APP_URL`                                                             | yes          | Public base URL, used in email links. **Must be `https://` in production**: this switches on `Secure` + `__Host-` session cookies and HSTS. |
| `MAIL_TRANSPORT`                                                      | no           | `smtp` (default) or `log` (send nothing, for dev/tests).                                                                                    |
| `MAIL_FROM`                                                           | yes for smtp | Sender, e.g. `Propfolio <no-reply@yourcompany.com>`. The display name can be changed in Settings → General.                                 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | for smtp     | SMTP server details.                                                                                                                        |
| `SEED_PASSWORD`                                                       | no           | Dev only: one known password for all seed users.                                                                                            |
| `POSTGRES_PASSWORD`                                                   | compose only | Password for the bundled Postgres container.                                                                                                |

All secrets come from the environment. Nothing secret is committed. `.env` is git-ignored.

---

## Commands

```bash
pnpm dev                 # Next.js dev server
pnpm worker:dev          # worker with reload
pnpm build && pnpm start # production build / server
pnpm worker              # production worker

pnpm lint && pnpm typecheck
pnpm test                # unit tests (pure logic, no database)
pnpm test:coverage       # unit tests + coverage (domain logic must stay ≥ 80 %)
pnpm test:integration    # services against a real Postgres (TEST_DATABASE_URL)
pnpm test:e2e            # Playwright against the production build (E2E_DATABASE_URL); run `pnpm build` first

pnpm db:migrate          # apply migrations (production-safe)
pnpm db:migrate:dev      # create a new migration during development
pnpm db:seed             # synthetic seed data — refuses to run when NODE_ENV=production
```

Integration tests default to `postgresql://propfolio:propfolio@localhost:5432/propfolio_test`,
and e2e tests to `.../propfolio_e2e`. Create those databases once. Both test suites **wipe their
database** on every run, so never point them at real data.

---

## Tech stack

- **Next.js 15 (App Router) + TypeScript (strict)**: UI, server actions and `/api/v1` routes
- **PostgreSQL + Prisma 6**: UUIDv7 ids, `timestamptz` instants, money as `Decimal(14,2)`
- **Tailwind CSS 4 + shadcn/ui-style components on Radix primitives**, lucide-react icons
- **React Hook Form + Zod**: the same schemas validate in the browser and on the server
- **argon2id** password hashing; server-side sessions (see [decisions](docs/decisions.md))
- **Nodemailer + React Email** for email templates
- **pg-boss** worker for scheduled jobs (no Redis needed)
- **Vitest** (unit + integration) and **Playwright** (end-to-end)
- Docker Compose: web, worker, Postgres, Mailpit

Coming in later phases: FullCalendar, TanStack Table, exceljs, S3-compatible document storage.

### Project layout

```
src/
  domain/        Pure business logic, no I/O (roles, password policy, lockout, dates…). Unit-tested.
  schemas/       Zod schemas shared by forms and the server.
  server/        Services (authorization is checked here), auth, audit log, mail, settings.
  app/
    (auth)/      Sign-in, password screens.
    (app)/       Signed-in app: Home, Calendar, Leases, Units, Tenants, Payments, Reports, Settings.
    api/         /api/health and /api/v1/* JSON routes.
  components/    UI kit (components/ui), app shell and shared pieces.
worker/          Background jobs (pg-boss).
prisma/          Schema, SQL migrations, seed.
tests/           Integration tests (real Postgres).
e2e/             Playwright tests.
```

---

## Roles

| Role                             | Can do                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**                        | Everything Leasing Staff can, plus users, buildings/units/unit types, settings, audit log, privacy actions, purging archived records. |
| **Leasing Staff**                | Leases, tenants, payments, documents, reminders, reports, exports, archiving.                                                         |
| **Property Management (Viewer)** | Read-only: buildings, units, occupancy, lease start/end dates, and the **tenant's display name only**.                                |

The permission matrix lives in `src/domain/auth/roles.ts`. **Every page, server action and API
route checks it on the server.** Hiding a menu item is only a convenience. Integration and e2e
tests prove that Leasing Staff and Viewers are refused by every admin service, page and API.

Other rules: accounts are created by an Admin (no public sign-up), users cannot change their own
role, there is always at least one active Admin, and accounts are turned off rather than deleted.

---

## Security and Data Privacy Act notes

What is in place now (Phase 1):

- **Passwords:** argon2id (19 MiB, t=2), minimum 10 characters, a check against very common
  passwords, and no forced rotation. New accounts get a one-time temporary password and **must
  set their own at first sign-in**.
- **Lockout:** 5 wrong passwords in a row lock the account for 15 minutes. Admins can unlock it
  sooner. Unknown emails and wrong passwords give the same message and take the same time.
- **Sessions:** a random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` with
  the `__Host-` prefix over HTTPS). Only its SHA-256 hash is stored. Sessions end after **30
  minutes of inactivity** or 12 hours at most. Changing a role or turning an account off ends that
  user's sessions immediately, and a password change signs out the user's other sessions.
- **Password links:** single use, 60 minutes, at most 3 self-service requests per hour.
- **Notifications:** users are emailed when their password or email address changes. An email
  change notifies both the old and the new address.
- **CSRF:** server actions are POST-only with Next.js Origin checks. JSON API routes reject
  state-changing requests whose `Origin` isn't the app.
- **Headers:** strict Content-Security-Policy, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy`, and HSTS in production.
- **Audit log:** append-only. A database trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`.
  It records sign-ins, failed sign-ins (with the reason), lockouts, password changes and resets,
  user changes (before/after) and settings changes, with the time, actor, IP address and browser.
  Password hashes and tokens are never written to it. Admins can search it under Settings → Audit log.
- **No personal data in logs:** application logs record error types and counts only, never
  email addresses, request bodies or tokens.

Coming in later phases: privacy notice and acknowledgement (Phase 2), Viewer data minimisation
for tenant data (Phases 2 and 6), document access through short-lived signed URLs (Phase 6),
tenant data export, correction and anonymisation, and the retention screen (Phase 6).

### Deployment requirements

- Serve over **HTTPS only** (set `APP_URL=https://…`). Terminate TLS at a reverse proxy or
  load balancer that **overwrites `X-Forwarded-For`**, so the IP addresses in the audit log can be
  trusted.
- Use a database and file storage with **encryption at rest** (e.g. a managed Postgres with storage
  encryption, and an S3 bucket with SSE).
- Expose only the web container. Postgres, Mailpit and the worker must not be public.

### Breach readiness (NPC 72-hour notification)

The National Privacy Commission requires notification within 72 hours of knowing about a
personal data breach. The audit log is designed to answer the questions that notification needs:

- **Who accessed what, and when:** every sign-in, failed sign-in and lockout, with the IP address
  and browser. Later phases add document downloads, exports and privacy actions.
- **What changed:** before/after values for user and settings changes, and later for every
  record change.
- **Which accounts were involved:** filter the audit log by person, action or date range.
- **Containment:** an Admin can turn an account off (which ends its sessions immediately) and send
  password reset links.

Keep audit log entries for at least the retention period your DPO sets. Back them up together
with the database (see below).

### Backups

- Use the managed Postgres provider's **automated daily backups with point-in-time recovery**
  (at least 7 days, ideally 30), stored encrypted and in a different region if possible.
- For the bundled Docker Postgres: `docker compose exec postgres pg_dump -U propfolio -Fc propfolio > backup.dump`,
  run nightly, then copy the file to encrypted off-site storage.
- **Test a restore** at least once a quarter: `pg_restore -d <empty-db> backup.dump`, then sign in.
- Documents (Phase 6) live in S3-compatible storage. Turn on versioning and server-side encryption.

---

## Build phases

| Phase                          | Scope                                                                               | Status  |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------- |
| 1. Foundation                  | Setup, auth, roles, users, audit log, layout, design system                         | ✅ Done |
| 2. Property and lease register | Buildings, unit types, units, tenants, lease wizard, renewal, termination, statuses | Next    |
| 3. Calendar and grid           | FullCalendar views, leases grid with in-line editing, filters, export               |         |
| 4. Reminders                   | Reminder inheritance, daily 06:00 job, digest email, "Mark as handled"              |         |
| 5. Payments                    | Charges with escalation, payments and allocation, balances, aging, voids            |         |
| 6. Documents, reports, privacy | Uploads, six reports, privacy export/anonymise, retention                           |         |
| 7. Polish                      | Accessibility, responsive, empty states, end-to-end flows                           |         |

Confirmed assumptions (brief §14): reminder lead times Residential [60, 30, 7], Office/Retail
[90, 60, 30], Warehouse/Industrial [180, 120, 90, 60, 30]; digest at 06:00 Asia/Manila; repeats
continue 30 days after expiry; Docker on a cloud VM with managed Postgres and S3; a neutral palette
with a teal accent until the brand colours arrive; no automatic penalties or interest.
