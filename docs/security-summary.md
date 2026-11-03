# Propfolio — security summary for penetration testers

_Version of 3 Nov 2026 (public launch, Phase 2). For an outside firm testing Propfolio before it
holds real tenant data. Code references are paths in this repository._

## 1. What Propfolio is

A web app for Philippine lessors to manage buildings, units, tenants, leases, rent, payments,
documents and reminders. Each customer (lessor) is an **account**; their staff sign in with
roles. Tenant records are personal data under the Data Privacy Act (RA 10173); the lessor is the
personal information controller, Propfolio is their processor.

**Most valuable targets:** one account reading or changing another account's data; tenant
personal data (names, TIN, contact details, signed contracts); taking over an Owner/Admin or the
platform admin; the audit log's integrity.

## 2. Architecture

| Part                | Technology                                                               | Where                                       |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Web app             | Next.js 15.5 (React 19, server components and server actions), Node 22   | `src/app`, `src/server`                     |
| Database            | PostgreSQL 16 via Prisma 6                                               | `prisma/schema.prisma`, `prisma/migrations` |
| Background jobs     | pg-boss worker (reminders, lease statuses, housekeeping, alerts)         | `worker/index.ts`                           |
| Files               | Private folder (or S3), served only through signed 5-minute links        | `src/server/documents`                      |
| HTTPS               | Caddy (Let's Encrypt), HSTS 2 years                                      | `deploy/Caddyfile`, `next.config.ts`        |
| Hosting (test site) | One DigitalOcean droplet, Singapore, Docker Compose; only 80/443/22 open | `deploy/`                                   |

Domain rules (pure, unit-tested) are in `src/domain`; services that touch data are in
`src/server`. Every service checks permissions itself (`assertCan`), pages call
`requirePageUser`, actions and API routes call `requireActor` (`src/server/auth/current.ts`).

## 3. Separation between customer accounts

Two independent locks (`src/server/db.ts`, migration `20261102120000_accounts`):

1. **Application:** a Prisma extension adds `accountId = <current account>` to every query on an
   account-owned table. The account comes from the session (`Session.accountId`); background
   jobs and sign-in set it explicitly. A query with no account throws instead of reading all.
2. **Database:** every query runs in a transaction that sets `app.account_id` and
   `SET LOCAL ROLE propfolio_tenant`. Row-level security policies on every account-owned table
   allow only rows of that account (`USING` and `WITH CHECK`). Sign-in internals (`Session`,
   `PasswordResetToken`, `RecoveryCode`, `TrustedDevice`, `SignInChallenge`, `RateLimit`) and
   platform tables are not readable by that role at all. `User` rows are visible only for
   members of the current account. Customers can't change their own plan, trial or suspension
   (column-level `UPDATE` grant on `Account`).

Code that works across accounts uses `asSystem()` explicitly: sign-in, the platform admin, the
worker's account loop. **Please try to reach another account's data** through every page, API
route and server action — tests that do this are in `tests/integration/accounts.test.ts` and
`e2e/accounts.spec.ts`.

Known limitation: inside a `db.$transaction(async (tx) => …)` callback, a query written against
`db` instead of `tx` runs outside the transaction with only the first lock. Reviewed by hand.

## 4. Authentication

- **Passwords:** argon2id (19 MiB, 2 iterations) — `src/server/auth/password.ts`. New passwords
  12–128 characters, not trivially common, not containing the email, and not found in Have I Been
  Pwned (k-anonymity range API, 5-character SHA-1 prefix; fails open if the service is down) —
  `src/domain/auth/password-policy.ts`, `src/server/auth/breached.ts`.
- **Two-step sign-in (TOTP, RFC 6238):** required for Owners and Admins (enforced on every page
  and action until set up), optional for others. Secrets encrypted with AES-256-GCM, key derived
  from `APP_SECRET`; each 30-second code works once; 10 one-time recovery codes (HMAC-SHA-256
  with `APP_SECRET`); the code step expires after 5 minutes or 5 wrong codes —
  `src/server/auth/two-step.ts`, `src/server/auth/sign-in.ts`.
- **Remembered devices:** opt-in, 30 days, random token (only its hash stored), revoked on
  password change/reset, by an Admin reset, or on request.
- **Lockout:** 5 wrong passwords or codes in a row lock the person for 15 minutes.
- **Rate limits** (database-backed, hashed keys): sign-in 60/10 min per IP and 20/10 min per
  email; codes 60/10 min per IP; reset requests 10/h per IP (plus 3/h per person); reset
  completions 20/h per IP; platform sign-in 10/10 min per IP — `src/server/rate-limit.ts`.
- **Sessions:** random 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-`
  cookie; only its SHA-256 is stored; 30 minutes idle, 12 hours absolute; revoked on sign-out,
  password change, role change, turning someone off, account suspension.
- **Password reset:** emailed single-use link, 60 minutes; same answer whether or not the email
  exists.
- **Platform admin** (Propfolio staff, `/platform`): separate table, sessions and
  `SameSite=Strict` cookie; password + TOTP always; 8-hour sessions; created only from the
  server's command line with a one-time 24-hour link; no membership in any account, sees
  account-level facts only (`src/server/platform`).

## 5. Authorization

Roles per account: Owner, Admin, Leasing Staff, Property Management (Viewer) — matrix in
`src/domain/auth/roles.ts`. Viewers never receive tenant contact, financial or document fields.
The Owner can't be removed or demoted. An Admin can't change the email/name or reset two-step
sign-in of someone who also belongs to another account.

## 6. Web protections

- CSRF: server actions check `Origin` (Next.js); API routes that change data require `Origin` to
  match `APP_URL` (`src/server/http.ts`).
- Headers: strict CSP (`script-src 'self' 'unsafe-inline'` — no nonces yet), HSTS,
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin` (`next.config.ts`).
- All input validated with Zod on the server (`src/schemas`); Prisma parameterises queries;
  the few raw SQL queries use tagged templates.
- **Uploads:** max 20 MB; type checked from the file's bytes (PDF, JPG, PNG, DOCX only), not its
  name; stored under random names outside the web root; served only via a signed 5-minute link
  that also requires a signed-in user of the same account; virus scan with ClamAV when
  `UPLOAD_VIRUS_SCAN=clamav` (refused, not stored, if the scanner is down).

## 7. Audit, logging, privacy

- Append-only audit log (database triggers reject UPDATE/DELETE/TRUNCATE) for every create,
  update, archive, sign-in, export, download and privacy action, inside the same transaction.
  Never passwords, tokens, codes or hashes; personal values are masked.
- Server logs contain error types and counts only — no emails, names or request bodies.
- Error tracking (Sentry, optional): error type and code location only, never messages
  (`src/server/monitoring`).
- Privacy tools: tenant data export, anonymisation, retention purge (`src/server/privacy`).

## 8. Operations

- **Backups:** nightly `pg_dump` + documents; local 14 days; off-site copies encrypted with
  `age` to a public key whose private key is held offline by the owner, kept 30 days; restore
  tested 3 Nov 2026 (`deploy/backup.sh`, `docs/restore.md`).
- **Monitoring:** `/api/health` for an external uptime check; email to platform admins on 30+
  failed sign-ins in 15 minutes; Sentry for unexpected errors.
- **Dependencies:** pinned versions; Dependabot weekly; `pnpm audit --prod` leaves 2 known
  findings, accepted: `deepmerge` (low, only merges our own e-mail options) and `minimatch`
  (moderate, used by the Excel library with fixed patterns only).
- **Secrets:** environment only (`deploy/.env`, root-only, written on the server); nothing in Git.

## 9. Encryption at rest — current status

| Data                                      | Status                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Off-site backups                          | Encrypted (`age`, X25519 + ChaCha20-Poly1305), key held offline                                                                                                                                                                                   |
| Authenticator secrets, recovery codes     | Encrypted / keyed with `APP_SECRET`                                                                                                                                                                                                               |
| Database and documents on the test server | On the droplet's own disk. DigitalOcean documents encryption at rest for Volumes and Managed Databases, but not for the droplet's local disk. **Planned:** move them to an encrypted Volume (≈ US$1/month) or a Managed Database before real data |

## 10. Environments

- **Test site (staging):** https://139-59-104-149.sslip.io — made-up data only, banner says so.
  Use it for testing. It is separate from production, which doesn't exist yet.
- **Production:** to be set up separately before real data (own server/database, own secrets).

## 11. Out of scope / not built yet

Self-serve sign-up and Google sign-in (launch Phase 3–4), billing (Phase 5), team invitations
(Phase 6). Please report anything you find there in later rounds.

## 12. Test accounts and contact

We will create, per tester: one Owner, Admin, Leasing Staff and Viewer in **two** separate
accounts, and a platform-admin account, on the test site only. Report findings to the owner of
Propfolio; please don't test denial of service or social engineering, and don't send email to
addresses other than your own.
