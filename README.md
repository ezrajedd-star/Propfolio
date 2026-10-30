# Propfolio

A lease ledger for rental property companies in the Philippines. It replaces an old
"Contract Scheduler" with one place for buildings, units, tenants, leases, rent schedules,
payments, documents, reminders and reports. It is designed first for **ease of use** by a busy,
non-technical Leasing team, and to meet the **Data Privacy Act of 2012 (RA 10173)**.

> **Status:** Phases 1–6 of 7 are complete: sign-in, roles, users, audit log, design system;
> buildings, units, tenants, the lease wizard, renewal, termination and calculated statuses; the
> calendar plus a spreadsheet-style leases grid with in-line editing and Excel/CSV export; the
> daily reminder email with "Mark as handled"; and payments: rent charges, recording payments,
> balances, the overdue list and aging; and documents, six reports, privacy tools (tenant data
> export, anonymise, retention), an on-screen Guide with a welcome tour, and a test (UAT) server kit.
> See [Build phases](#build-phases).

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

The seed also creates 3 buildings (including an industrial complex with standalone
warehouses), 30 units, 20 tenants and 25 leases in every status, with payments for most past
rent (a few leases are left overdue, one in each age group). Lease dates are relative to the day
you run it, so there is always something expiring. Seed users (synthetic, `.test` domain) are `admin@propfolio.test`, `leasing@propfolio.test`
and `viewer@propfolio.test`. Their passwords are **generated on every seed run** and printed to
the terminal. Set `SEED_PASSWORD` in `.env` if you want one fixed local password.

### Everything in Docker

```bash
docker compose up --build -d      # postgres, mailpit, migrate (one-off), web, worker
docker compose run --rm seed      # optional demo data; prints the sign-in passwords
```

The app is on http://localhost:3000 and test emails are at http://localhost:8025 (Mailpit).
No `.env` file is needed for a local trial. To choose your own values, create a `.env` next to
`docker-compose.yml` with only the lines you want to change, e.g. `POSTGRES_PASSWORD=...` or
`SEED_PASSWORD=...` (one known password for all demo users). Don't copy `.env.example` for
Docker: its `localhost` addresses are for running without Docker.

`docker compose down` stops everything and keeps the data; `docker compose down -v` also deletes
the database.

### Testing email locally

With `MAIL_TRANSPORT=smtp` and the default `SMTP_HOST=localhost` / `SMTP_PORT=1025`, every email
(password links, change notifications and, later, reminder digests) goes to **Mailpit**. Open
http://localhost:8025 to read them. Nothing leaves your machine.

With `MAIL_TRANSPORT=log`, emails are not sent at all. Only the subject and the number of
recipients are logged, never addresses or contents.

---

## Environment variables

| Variable                                                                            | Required     | Description                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                      | yes          | PostgreSQL connection string. Use `?sslmode=require` for managed databases.                                                                 |
| `APP_URL`                                                                           | yes          | Public base URL, used in email links. **Must be `https://` in production**: this switches on `Secure` + `__Host-` session cookies and HSTS. |
| `MAIL_TRANSPORT`                                                                    | no           | `smtp` (default) or `log` (send nothing, for dev/tests).                                                                                    |
| `MAIL_FROM`                                                                         | yes for smtp | Sender, e.g. `Propfolio <no-reply@yourcompany.com>`. The display name can be changed in Settings → General.                                 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`               | for smtp     | SMTP server details.                                                                                                                        |
| `APP_SECRET`                                                                        | production   | Random secret (≥ 32 characters) that signs 5-minute document links. `openssl rand -hex 32`.                                                 |
| `STORAGE_DRIVER`                                                                    | no           | Where uploaded documents go: `local` (default; a private folder) or `s3`.                                                                   |
| `STORAGE_DIR`                                                                       | for local    | Folder for documents (default `./storage`). Keep it out of the web root and back it up.                                                     |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for s3       | Private bucket details. `S3_ENDPOINT` only for non-AWS services (DigitalOcean Spaces, MinIO). Files are encrypted at rest (SSE).            |
| `UAT_MODE`                                                                          | no           | `true` shows the "Test version" banner and the "Send feedback" button.                                                                      |
| `MAIL_SKIP_TEST_DOMAINS`                                                            | no           | `true` stops emails to demo addresses (`@propfolio.test`, `example.com` …). Set on hosted servers.                                          |
| `SEED_PASSWORD`                                                                     | no           | Dev only: one known password for all seed users.                                                                                            |
| `POSTGRES_PASSWORD`                                                                 | compose only | Password for the bundled Postgres container.                                                                                                |

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
- **pg-boss** worker for scheduled jobs (no Redis needed): lease status sync at 00:05,
  housekeeping at 03:15 and the reminder email at 06:00 Manila time
- **Vitest** (unit + integration) and **Playwright** (end-to-end)
- Docker Compose: web, worker, Postgres, Mailpit

- **FullCalendar** (calendar), **TanStack Table** (leases grid), **exceljs** (Excel export)

Coming in later phases: S3-compatible document storage.

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

## How reminders work

1. **Settings pass down:** the default (Settings → Unit types and reminders) → each unit type →
   an optional override on a single unit. A setting is a list of "days before the lease ends"
   (e.g. 90, 60, 30) plus what happens after the last one: nothing, weekly on a chosen day, or
   daily, optionally continuing for a number of days after the end date.
2. **Reminder dates are stored per lease** (`ReminderEvent`) when the lease is saved. They are
   recalculated automatically when the lease's dates change, it is renewed, ended early or
   archived, or when the unit's, unit type's or default settings change. Past reminders are history
   and never rewritten.
3. **Every morning at 06:00 (Asia/Manila)** the worker sends **one email** to every active Admin
   and Leasing Staff user (never Property Management), listing every lease with a reminder due,
   soonest first, each with a link. On days with nothing due, no email is sent. Subject example:
   `Lease reminders – 3 leases need attention (23 Oct 2026)`.
4. **Mark as handled** (on the lease's Reminders tab, the calendar, or Home) stops further reminders
   for that lease. Renewing or ending a lease early also stops them. All of these can be undone.
5. **If sending fails**, the job retries 3 times (10, 20 and 40 minutes later). Reminders that still
   didn't go out are included in the next day's email (up to a week back). Admins see each day's
   result, and any error, in **Settings → Reminder emails**, with a "Try again" button. If the worker
   was down at 06:00, it sends the day's email when it starts.
6. The job is **idempotent**: one email per day at most, however often it runs.

To see the emails locally, run the worker with Mailpit (see [Testing email locally](#testing-email-locally)).

## How payments work

1. **Charges come from the lease terms.** Saving a lease creates every rent charge for its whole
   term: one per month from the start date (a short last month is prorated by days), due on the
   rent due day (on or after the start of each month; short months use their last day). Rent
   increases are applied: a percentage every N months (compounded, rounded to the centavo each
   time) or fixed new amounts from given dates. The **security deposit** and **advance rent** are
   separate one-off charges due on the start date. Staff can add one-off charges (parking,
   utilities, repairs).
2. **Recording a payment:** choose the lease, enter the amount, date and method. It goes to the
   **oldest unpaid charges first**; staff can change the split. Anything left over becomes
   **credit** on the lease, which "Use credit" applies to later charges. Each payment gets a
   number (`PAY-2026-0001`) and a printable **acknowledgement — not an official receipt**.
3. **Posted records are never edited or deleted.** A wrong payment or charge is **voided with a
   reason**; it stays visible, marked "Voided". A charge with payments against it can only be
   voided after those payments are.
4. **Changing lease terms** recalculates only **future, unpaid** rent charges. Charges already
   due or paid are kept and listed on the confirmation screen, so nothing paid ever changes.
   **Ending early** cancels unpaid rent due after the last day.
5. **Overdue** means unpaid after the due date. One calculation feeds every total (Home, the lease
   page, the leases grid, the Payments page, the daily email), so they always agree. The Payments
   page groups overdue amounts by age (1–30, 31–60, 61–90, 90+ days) and exports to Excel/CSV.
   No penalties or interest are added automatically.

## Documents

- Allowed: **PDF, JPG, PNG and Word (DOCX)**, up to **20 MB**. The type is checked from the file's
  contents, not its name, so a renamed program is refused.
- Files are stored privately (`STORAGE_DIR`, or a private S3 bucket) under random names and are
  never served directly. "Open" checks permission, writes to the audit log, then gives a link
  that works for **5 minutes**.
- Removing a document hides it (with a reason); it stays on record. Viewers can't see documents.

## Reports

Expiry pipeline, Occupancy, Rent roll, Collections, Overdue aging and Renewal history. Each can
be filtered by building and unit type (and dates or days ahead where it makes sense) and
downloaded for Excel or as CSV. Downloads are audited. Overdue aging uses the same calculation as
every other overdue total.

## The on-screen Guide

- **Welcome tour:** the first time someone signs in, a short tour (5–8 steps, by role) points at
  the main menu items and ends at the **Guide** button. "Take the tour again" is in the account
  menu.
- **Guide button** (bottom of the menu; top bar on phones): numbered notes appear next to the main
  buttons on the current page, with a panel explaining each in a sentence. Click a note to
  highlight the button. It stays on while you move around until you turn it off.
- **Task tours:** short step-by-step tours for the key tasks: adding a lease, adding a tenant,
  adding a building and its units, and using reports. Each starts by itself the first time a person
  opens that page (after the welcome tour), and replays from the page's **Show me how** button.
- The words live in `src/domain/guide/content.ts`. To explain a new button, add
  `data-guide="some-id"` to it and a hint with the same id.

## Testing with others (UAT)

See **[docs/deploy-uat.md](docs/deploy-uat.md)**: a step-by-step guide to put a test version on a
cloud server in Singapore with HTTPS, real emails (Brevo) and daily backups, plus a message you
can send to testers. The test version shows a "Test version" banner and a **Send feedback**
button; notes appear in Settings → Tester feedback.

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

Added in Phase 2:

- **Privacy notice** (Settings → Privacy) shown and printable whenever a tenant is added. The
  acknowledgement date and method are recorded and required. Retention defaults to 10 years after the
  last lease ends (see [decisions](docs/decisions.md#8-data-retention-period-and-privacy-notice-phase-2)).
- **Proportionality:** tenants have only the fields in the brief. The TIN is optional and validated.
- **Data minimisation for Viewers:** unit screens give Property Management only the tenant's
  display name and lease dates. Lease, tenant, money and contact data are never sent to them, which
  tests check against the actual payloads.
- **Audit log** records every create, update, archive, renewal and termination. Tenant personal
  values are not copied into it (only which fields changed), so anonymisation stays complete.

- **Documents** are served only through 5-minute signed links, after a permission check, and every
  open is audited. File names aren't copied into the audit log.
- **Data subject rights (Admins, on the tenant's page):** _Download their data_ (JSON of everything
  held: details, leases, charges, payments, document list); _Edit_ to correct; _Anonymise_, which
  replaces name, TIN, contact details, address and notes with placeholders, clears free-text notes
  on their leases and payments, and deletes their files. Rent, charges, payments and totals are
  kept so the accounts still add up. It is blocked while they have a current or future lease, needs
  a reason and the tenant's name typed to confirm, and can't be undone.
- **Retention screen** (Settings → Privacy) lists tenants whose last lease ended more than the
  retention period ago, with one button to anonymise them all.

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
| 2. Property and lease register | Buildings, unit types, units, tenants, lease wizard, renewal, termination, statuses | ✅ Done |
| 3. Calendar and grid           | FullCalendar views, leases grid with in-line editing, filters, export               | ✅ Done |
| 4. Reminders                   | Reminder inheritance, daily 06:00 job, digest email, "Mark as handled"              | ✅ Done |
| 5. Payments                    | Charges with escalation, payments and allocation, balances, aging, voids            | ✅ Done |
| 6. Documents, reports, privacy | Uploads, six reports, privacy export/anonymise, retention, on-screen Guide, UAT kit | ✅ Done |
| 7. Polish                      | Accessibility, responsive, empty states, end-to-end flows                           | Next    |

Confirmed assumptions (brief §14): reminder lead times Residential [60, 30, 7], Office/Retail
[90, 60, 30], Warehouse/Industrial [180, 120, 90, 60, 30]; digest at 06:00 Asia/Manila; repeats
continue 30 days after expiry; Docker on a cloud VM with managed Postgres and S3; a neutral palette
with a teal accent until the brand colours arrive; no automatic penalties or interest.
