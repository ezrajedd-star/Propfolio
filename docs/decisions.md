# Decisions

Short records of choices that differ from, or refine, the original brief.

## 1. Own session handling instead of Auth.js (Phase 1)

The brief suggests Auth.js with the credentials provider and database sessions. Auth.js does not
support database sessions with the credentials provider (it forces JWT sessions), and v5 is
still a beta. We also needed custom behaviour anyway: lockout, a forced password change at first
sign-in, a 30-minute idle timeout, and ending sessions immediately when a role changes or an
account is turned off.

So we keep a small session layer (`src/server/auth/`). It uses a random 256-bit token in an
httpOnly cookie, stores only the token's SHA-256 hash in the `Session` table, and checks idle and
absolute expiry on every request. This matches what the brief asks for ("database sessions") and
is fully covered by tests.

## 2. Next.js 15.5 and Prisma 6

At build time the newest majors were Next.js 16 and a Prisma 8 release candidate. We pinned the
latest patch releases of Next.js 15.5 and Prisma 6.19, which are mature and widely deployed.
They can be upgraded later in a dedicated change. Every dependency version is pinned exactly.

## 3. Hand-written shadcn/ui components

The shadcn registry wasn't reachable from the build environment, so the components in
`src/components/ui` are written in the shadcn style on top of `radix-ui` primitives. They are
plain source files that we own and can change, exactly as shadcn intends.

## 4. Native `<select>` for simple choices

For non-technical users and phones, the browser's own dropdown is the most familiar and
accessible option. Custom listboxes are kept for cases that need search.

## 5. Temporary passwords for new accounts

When an Admin creates an account, Propfolio shows a one-time temporary password (once) for the
Admin to hand over. The user must replace it at first sign-in (brief §2). The password is never
emailed. "Reset password" emails a single-use link, as the brief asks.

## 6. `SameSite=Lax` session cookie

`Strict` would make links in reminder emails open the sign-in page even for signed-in users.
`Lax` keeps those links working. Cross-site form posts are still blocked by Origin checks on
every state-changing request.

## 7. Showing the "locked" message

When an account is locked, the sign-in page says so and tells the user when to try again. This
reveals that the account exists, but only after 5 wrong attempts. For an internal staff tool,
clear guidance matters more than hiding which emails have accounts. Unknown emails and single
wrong passwords still get the same generic message.

## 8. Data retention period and privacy notice (Phase 2)

The product owner asked us to decide these without waiting for a privacy officer, as long as
they meet the minimum requirements of the Data Privacy Act (RA 10173).

- **Retention: 10 years after a tenant's last lease ends.** The DPA (Sec. 11(e)) allows
  personal data to be kept only as long as needed for its purpose, for legal claims, or as the
  law requires. Actions on written contracts can be filed for up to 10 years (Civil Code,
  Art. 1144), and tax rules also require accounting records to be kept for years. After the
  period, personal fields are anonymised and financial totals are kept (Phase 6 adds the
  screen for this). Admins can change the period in Settings → Privacy.
- **Privacy notice:** the standard wording (Settings → Privacy) covers what the DPA's right to
  be informed requires (Sec. 16(b), Sec. 18): who collects the data, what is collected, why,
  the legal basis (Sec. 12(b), (c), (f)), who receives it, how long it is kept, how it is
  protected, the data subject's rights and how to use them, the privacy officer's contact, and
  the right to complain to the National Privacy Commission. It is shown, and can be printed,
  whenever a tenant is added. The acknowledgement date and method are recorded.
- The company name, privacy officer and retention period are filled into the notice
  automatically. **Action for Admins:** enter the real privacy officer's name and email (the
  Home checklist reminds you). Having a lawyer read the wording later is good practice, but it
  doesn't block anything.

## 9. Personal data is not copied into the audit log

The audit log is append-only, so it can never be anonymised later. For tenant fields that are
personal data (names, TIN, contact details, address, notes), the log records _which_ fields
changed and who changed them, not the values. Non-personal changes (dates, rent, statuses) keep
full before/after values.

## 10. Extra lease status: "Starts soon" (UPCOMING)

A lease whose start date is in the future (often a renewal) shows "Starts soon" instead of
"Active", because the brief's status list had nothing for this case and "Active" would mislead.

## 11. Lease drafts are kept on the server

The wizard autosaves to a `LeaseDraft` row per user instead of browser storage, so tenant details
typed into a half-finished lease don't stay on shared office computers. Drafts not touched
for 30 days are deleted by the worker.

## 12. "Fixed amount on dates" escalation

This is a list of dates and the new monthly rent from each date ("From 1 Jan 2028, rent is
₱55,000"). Staff find a new amount easier to check against the contract than an increment.

## 13. Overlapping leases are blocked by the database too

Besides the friendly check in the service, a PostgreSQL exclusion constraint (`btree_gist`) makes
overlapping, non-archived leases on the same unit impossible, even under concurrent saves.
Tenant search uses `pg_trgm`. Both extensions are available on managed Postgres services
(AWS RDS, Google Cloud SQL, Azure).

## 14. Dates in forms

Date fields use the browser's own date picker (best on phones) and repeat the chosen date in
words underneath ("Friday, 23 Oct 2026"), so day and month can't be confused. A fully custom
picker can be added in Phase 7 if users still find it confusing.

## 15. Calendar contents (Phase 3)

- Reminder events show the lead-time reminders ("90 days before the end"), not the weekly or
  daily repeats after them, which would crowd the month view. The lease's Reminders tab lists
  everything.
- Rent due events show the due date only. Amounts are on the lease's Payments tab.
- Property Management sees only lease start and end events, with the tenant's display name. The
  server never sends them references, rent or lease ids.
- The calendar loads its events from `/api/v1/calendar` each time it opens and when the browser
  tab regains focus, so an edit in the grid shows up there without reloading the page.
- Phones open the calendar in the List view, which reads better on a small screen.

## 16. Leases grid (Phase 3)

- In-line edits: remarks, rent due day and contact person. The contact person belongs to the
  tenant, so editing it in one row updates every lease of that tenant. Dates, rent, unit and
  tenant still go through the full form with its confirmation step.
- Undo after an in-line edit is simply another edit back to the old value, so it is audited too.
- Column layout (shown/hidden, order, group by building) is saved on the server per user, so it
  follows people between computers. Saved layouts are repaired automatically if columns change.
- "Balance due" shows what is due now (overdue amounts in red with an icon); the "Overdue" chip
  shows only leases with overdue rent.
- Exports (Excel or CSV) use the grid's current filters and visible columns, or only the selected
  rows. Every export is written to the audit log. In CSV, values starting with `=`, `+`, `-` or `@`
  are prefixed with an apostrophe so spreadsheet programs can't run them as formulas.
- Bulk actions are limited to export and archive, as the brief asks. A bulk archive reports any
  lease it couldn't archive instead of stopping silently.

## 17. Reminder engine (Phase 4)

- Reminder dates are stored per lease (`ReminderEvent`) instead of being worked out only at send
  time, so the Reminders tab shows exactly what will be and was sent, and failures can be retried.
  Only future PENDING rows are ever recalculated.
- The daily email lists **leases**, not individual reminders: one line per lease, with the most
  relevant reason ("30-day reminder before the lease ends", "The lease ended 9 days ago and
  hasn't been renewed or marked as handled").
- Missed reminders (failed sends, or the worker was down) are caught up for up to **7 days**. Older
  ones are not sent, to avoid a confusing flood after a long outage.
- A failed reminder for a lease that has since been renewed, ended or handled is marked "Not
  needed" instead of being retried.
- "Mark as handled" can be undone; reminders then resume from today. Both actions are audited.
- Error messages shown to Admins have email addresses removed.
- The email can include a short "overdue payments" section (Settings → Reminder emails). Overdue
  amounts alone never trigger an email; they ride along with the day's lease reminders.

## 18. Billing rules (Phase 5)

- **Charges are stored, not worked out on the fly.** Every rent month, the deposit and the
  advance rent is a `Charge` row, so payments can point at exactly what they paid and the history
  never shifts when terms change.
- **Months run from the start date** (a lease starting 15 Mar has periods 15 Mar–14 Apr, …). The
  due date is the first date on or after the period start whose day is the rent due day (day 31
  falls on the month's last day in short months). A short final period is **prorated by days**.
- **Deposit and advance rent are separate charges** due on the start date, rather than being
  folded into the first months. The advance is shown as owed and paid like any other charge; how it
  is used up at the end of the lease is a business decision we left to staff (add a charge or void
  one, with a reason).
- **Percentage increases compound**, rounded to the centavo at each step (5 % on ₱50,000 →
  ₱52,500.00 → ₱55,125.00). Fixed-amount steps apply from the first month starting on or after the
  date given.
- **Oldest first by default**, with a manual split allowed. Over-payments become credit instead of
  being forced onto future months, so staff decide when credit is used.
- **Terms changes never touch the past.** Only charges that are not yet due and have nothing paid
  against them are recalculated; the rest are kept and shown on the confirmation screen with the
  amount the new terms would give, so staff can adjust with a charge if needed.
- **Payment acknowledgements are not official receipts.** BIR-registered official receipts and
  invoices are outside Propfolio's scope; the printout says so clearly.
- **Aging buckets** use the oldest unpaid due date of each charge: 1–30, 31–60, 61–90 and 90+
  days late.

## 19. Documents (Phase 6)

- The file type is checked from the file's first bytes (PDF, JPG, PNG, DOCX), not its name or the
  browser's claim. Names are cleaned and stored, but files are saved under random names.
- **Storage:** a private folder on the server for now (`STORAGE_DRIVER=local`), or a private S3
  bucket with server-side encryption (`s3`), as the brief plans for production. Local files are
  served by our own route with a 5-minute HMAC-signed link and a signed-in check; S3 files with a
  5-minute pre-signed URL. Either way, every open is permission-checked and audited first.
- File names can contain personal data, so the audit log records only the document id, type and size.
- Malware scanning isn't in the brief and isn't included. Uploads are limited to four document
  types checked by content. A scanner (e.g. ClamAV) can be added before production if IT wants one.

## 20. Anonymising a tenant (Phase 6)

- Allowed only when the tenant has no current or future lease, with a reason and the name typed to
  confirm. Personal fields become placeholders ("Anonymised tenant 3F9A21"); lease remarks, early-end
  reasons, "handled" notes and payment notes are cleared because they may name people; uploaded
  files are deleted. Amounts, dates, lease and payment numbers stay, so totals and reports are
  unchanged.
- The retention period runs from the end of the tenant's last lease, or from archiving if that is
  later. The retention screen anonymises; nothing is hard-deleted, so the money records stay whole.

## 21. On-screen Guide (Phase 6)

- Two parts, no separate manual: a **welcome tour** at first sign-in (5–8 steps by role,
  skippable, replayable from the account menu) and a **Guide** button that shows numbered notes on
  the current page's main buttons, with a panel explaining each in a sentence.
- Built in-house rather than with a tour library, to keep it accessible (keyboard, screen readers,
  reduced motion) and to show Viewers only what they can use. Whether the tour was seen and whether
  the Guide is on are saved per person on the server, so it follows them between computers.

## 22. Test (UAT) server (Phase 6)

- A single DigitalOcean droplet in Singapore running the same Docker images, with Caddy for HTTPS.
  Without a company domain it uses a free `<ip>.sslip.io` address, which still gets a real
  certificate. Emails go through Brevo's free plan.
- `UAT_MODE=true` shows a "Test version — made-up data" banner and a **Send feedback** button.
  Feedback stores the page path without its query string (searches can contain names).
- Emails to demo addresses (`.test`, `example.com`) are skipped on hosted servers
  (`MAIL_SKIP_TEST_DOMAINS`).
- Production will move the database and files to managed, encrypted services (Phase 7).

## 23. Task tours, adding many units, and click feedback (UAT round 1)

- **Task tours** for adding a lease, a tenant, a building and units, and reports. Each starts
  once per person, the first time they open that page, then lives behind "Show me how". They
  never start before the welcome tour is done, and only one tour shows at a time.
- **Adding many units at once:** Admins type a list or ranges ("101 to 120", "G-01 to G-12",
  "101-120"); numbers the building already has are skipped and reported, not duplicated. At most
  300 per batch. Adding units stays Admin-only; the Units page now says so to Leasing Staff and
  gives Admins an obvious "Add a building or units" button.
- **Click feedback:** every link click immediately shows a progress bar and "Opening…", so a slow
  server never looks like a dead button. We tried Next.js loading screens first, but they stream
  pages in pieces and a click during start-up could be lost, so we didn't use them.
- **Not found:** unknown or malformed ids on lease, tenant, payment and unit pages show a
  friendly "We couldn't find that" page with HTTP 404, instead of an error (found by the QA robot).
- The leases grid now saves a column change even if you leave the page within the 0.6-second
  save delay.

## 24. Separate customer accounts (public launch, Phase 1)

- **Two locks.** The Prisma client is extended (`src/server/db.ts`): every query on an
  account-owned table gets `accountId = <current account>` added, and runs in a transaction that
  sets `app.account_id` and switches to the role `propfolio_tenant` (`SET LOCAL ROLE`), so
  Postgres row-level security also applies. The app keeps one database login (the tables'
  owner, used by migrations and the worker's account loop); customer work never runs as it.
- **Where the account comes from:** the session (server actions and API routes look it up once
  per request; pages use the memoised session). Sign-in, password resets, the platform admin and
  the worker's loop say so explicitly (`asSystem`, `runInAccount`). No account → error.
- **New rows** take their account from the transaction (`DEFAULT current_account_id()`), and the
  policies refuse rows for any other account. Inside `db.$transaction(async (tx) => …)` code must
  use `tx`; the array form of `$transaction` is refused for customer data, because those queries
  are built before the account can be set.
- **New tables** get the tenant role's privileges by default but stay invisible until their
  migration enables row-level security with a policy: add one for every account-owned table.
- **People:** `User` is the sign-in (email, password, lockout); `Membership` holds the role and
  "turned off" per account. One person can belong to several accounts (owner's answer, 2 Nov
  2026); a session works in one account, the most recently used. Switching accounts in the app
  comes with teams (launch Phase 6). An Admin can't change the name or email of someone who also
  belongs to another account.
- **Owner** role: one per account (database-enforced), all Admin permissions, can't be turned
  off or have its role changed, and isn't a role Admins can hand out. The migration made the
  longest-standing active Admin the Owner.
- **Per account:** settings (company name now lives on the account; new company address appears
  in the privacy notice, which names the lessor as personal information controller, never
  Propfolio), lease/payment numbers, building codes and unit type names, drafts, saved layouts,
  feedback and the daily reminder email.
- **Migration** `20261102120000_accounts` moves existing data into Account #1
  (`00000000-0000-7000-8000-000000000001`) and signs everyone out. It was rehearsed on a copy of
  the demo data: forward, back (`prisma/rollback/20261102120000_accounts.down.sql`) and forward
  again, with identical row counts and money totals each time.
- **Suspended accounts:** nobody can sign in (with a "your company's account is paused"
  message), open sessions end, and the worker skips them. Nothing is deleted.
- **Platform admin:** separate people, sessions and cookie (`SameSite=Strict`), no membership in
  any account. Password (12+ characters) plus a time-based code (RFC 6238, own implementation
  with the RFC's test vectors; codes can't be reused); authenticator secrets are encrypted with
  a key derived from `APP_SECRET`. Created from the command line with a one-time 24-hour link.
  Its actions are audited with no account (customers don't see them in their own log).
- **Plan fields** (`plan`, `trialEndsAt`, `paidUntil`) exist so the platform admin can work with
  them; what each plan allows comes in launch Phase 3 (plans, limits and trial).

## 25. Security hardening (public launch, Phase 2)

- **Two-step sign-in (TOTP)** for customers: required for Owners and Admins, optional for
  others. Required people are sent to `/setup-two-step` (outside the app layout, like the
  password change) before anything else; `twoStepGraceUntil` lets new sign-ups wait (Phase 3).
  Codes come after the password on a separate screen, within 5 minutes and 5 tries, and count
  towards the lockout. Ten recovery codes, keyed with `APP_SECRET` (a stolen database alone
  can't test guesses). "Don't ask again on this device for 30 days" is opt-in, and ends on a
  password change/reset or an Admin reset. Admins can reset it only for people who belong to
  their account alone; someone in several accounts asks Propfolio.
- **Rate limits** in a database table (fixed windows, SHA-256 keys), so they survive restarts and
  several app processes; limits sized for an office sharing one IP address. Requests with no
  known IP (local development) aren't limited.
- **Passwords:** new ones need 12+ characters; existing shorter ones keep working until changed.
  The breached-password check sends only a 5-character hash prefix and **fails open** (a
  service outage must not stop people changing a compromised password).
- **Virus scanning** with ClamAV, **fails closed** (uploads are refused while the scanner is
  down). Off on the test server, whose 2 GB of memory can't hold ClamAV; switch on with a 4 GB
  server (owner's decision, ≈ US$12/month more).
- **Error tracking:** Sentry's envelope format, built by hand instead of the SDK, so that exactly
  the error type and stack frames leave the server. Optional (`SENTRY_DSN`).
- **Backups** encrypted with `age` to a public key; the private key never touches the server.
  Off-site storage is any S3-compatible provider (Backblaze B2's free tier suggested), 30 days.
  Restore rehearsed end to end on 3 Nov 2026.
- **Encryption at rest:** DigitalOcean states it for Volumes and Managed Databases, not for a
  droplet's own disk, so the database and documents should move to an encrypted Volume
  (≈ US$1/month) or a Managed Database before real data.
- **Dependencies:** 30 audit findings fixed by upgrades and overrides; 2 accepted (see the
  security summary). Next.js 16 is a separate upgrade.
- **Staging:** the current test server is the staging environment; production will be a separate
  server with its own secrets, set up before real data.

## 26. Plans, limits and the trial (public launch, Phase 3)

Confirmed by the owner on 4 Nov 2026: Premium ₱3,500 a month; Pro up to 50 units, Premium up to
200 (above that, "contact us"); Premium includes 5 users; no extra seats for now.

- **One configuration place:** `src/domain/plans/plans.ts` holds prices, unit and user limits,
  the 30-day trial, the reminder days (7 and 1), which plan each feature needs, and the plan
  comparison text. Nothing else hard-codes them.
- **Which plan is in force** (`effectivePlan`): a running trial gives Premium; otherwise a paid
  period (`paidUntil` today or later) gives the chosen plan; if a trial or paid period was set
  and has ended, the account is on **Free**. With **neither date set**, the chosen plan applies
  with no end date. That keeps the first customer (created by the accounts migration as Premium,
  with no dates) on Premium, so nobody is downgraded by this change.
- **Checked on the server like roles.** The session reads the account's plan and unit count on
  every request; `requirePageUser`, `requireActor` and `assertCan` check role AND plan in one
  place. A page the plan doesn't include sends people to `/plan/locked` ("Available on Pro", with
  Upgrade); an action or API call answers 403 `PLAN_LIMIT` with a plain message. Buttons use
  `canDo`, the same check. Locked menu items stay visible with a lock.
- **Features by permission:** payments and reports → Pro; users (more than one), document
  upload and the audit log screen → Premium. Viewing documents stays on every plan, so files
  stay viewable after a downgrade. A record's own History tab stays on every plan.
- **Custom reminder lead times (Pro):** Free can't save its own lead times; switching back to the
  standard ones is always allowed. Lead times saved during a trial **keep working** after a
  downgrade (nothing is deleted or silently changed); they just can't be edited.
- **Read-only:** an account over its plan's unit limit (Free 3, Pro 50, Premium 200) can look,
  export and use the privacy tools, and **archive units** to get back within the limit; anything
  else that changes data is refused. Viewing pages under Settings stays open. Applies to every
  plan, not only Free (e.g. a 120-unit trial account that then pays for Pro).
- **Unit and user limits** are counted inside the transaction under a per-account advisory lock,
  so two people adding the last unit at once can't both succeed. Restoring an archived unit and
  turning a person back on count too.
- **Extra users after a downgrade** are paused, not deleted: the Owner always signs in, plus the
  longest-standing other active members up to the limit. The others see "Your company's plan
  doesn't include your sign-in right now…" and their open sessions end. Upgrading restores them.
  Password reset links aren't sent to paused people. The platform admin pages flag an account
  that is over its user limit.
- **Trial reminders:** a daily 09:00 Manila worker job emails the Owner and Admins 7 days and 1
  day before the trial's last day. `TrialReminder` records each (trial end, lead time), so each is
  sent once; a failed send is released and retried. A missed day catches up, and the 7-day email
  is never sent late on top of the 1-day one. Propfolio's own table: not reachable from customer
  work. Reversible: `prisma/rollback/20261104090000_trial_reminders.down.sql` (rehearsed:
  forward, back, forward).
- **Upgrading** until PayMongo (Phase 5): the Plan page shows the plans and, for the Owner, an
  "Email us" button (`SUPPORT_EMAIL`); the platform admin then records the bank transfer or
  **changes the plan** (new, audited, with a reason). Changing the plan replaces any trial; a
  recorded paid-until day still governs.

## 27. Self-serve sign-up and onboarding (public launch, Phase 4)

- **No half-made accounts.** "Start free" keeps the sign-up in `PendingSignUp` (hashes only)
  until the 6-digit code is typed on the same screen; only then are the account, its Owner, the
  30-day Premium trial (to the end of the Manila day), the standard unit types, privacy-contact
  defaults and the legal acceptances created, in one transaction. Codes: 15 minutes, 5 wrong
  tries, a new code at most once a minute and 5 per sign-up; HMAC with `APP_SECRET`; never in
  an email subject (subjects appear in mail logs). A second click can't create two accounts.
- **"That email already has an account. Sign in instead?"**, as the brief asks, although it tells
  a visitor that an email is registered; sign-ups are rate-limited per IP (10 an hour).
- **Google** (OpenID Connect, code flow with PKCE, state and nonce) with no new library: the ID
  token comes straight from Google's token endpoint over TLS with our client secret, so its
  claims are checked (issuer, audience, expiry, nonce, verified email) rather than its signature,
  as the spec allows. An email that already has an account signs into it and is linked; an
  account linked to another Google account isn't taken over; two-step sign-in and lockout still
  apply. Someone new gives the company name and ticks the box on one more screen. Off until
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set. Error codes, never text, go in the address.
- **Bot check:** Cloudflare Turnstile, invisible to most people, off until both keys are set. A
  rejected token is refused; if Cloudflare can't be reached the sign-up is allowed (and logged).
- **Legal documents** are versioned in `src/domain/legal/documents.ts` (change a `version` to
  publish). Each acceptance (person, document, version, time, IP) is kept; anyone missing a
  current version sees "We've updated our terms" before any page. Existing people are asked once
  after this release. The pages at `/legal/*` are public placeholders "[LAWYER TO SUPPLY]".
- **Keep me signed in** (sign-in screen, also through the code step and Google): the session
  lasts 30 days with no idle timeout, except Owners and Admins while the account's setting
  "Sign Owners and Admins out after 30 minutes without activity" (Settings → General, on by
  default) is on. Without it, sessions are as before (30 idle minutes, 12 hours).
- **Two-step sign-in** for new Owners is the last onboarding step, required after 14 days.
- **Onboarding** (Home, Owners and Admins): first building → Excel import or units → a lease →
  its first reminder → two-step sign-in. The welcome tour and Guide stay.
- **Excel import** (Settings → Import from Excel): a template (Read me + Buildings, Units, Tenants,
  Leases). The whole file is checked first with the forms' own rules plus duplicates, references
  between sheets and to existing records, overlapping leases and the plan's unit limit, and every
  problem is listed by sheet and row. Nothing is saved unless all of it is right. Saving uses the
  normal services (rent schedules, reminders, lease numbers, audit). The database layer can't
  wrap many services in one transaction, so if a save still fails part-way (a race), what the
  import created is archived again and the person is told nothing was kept. 2 MB, 1,000 rows per
  sheet.
- **Sign-up funnel** (`FunnelEvent`, counts only): started, verified, first unit, first lease, shown
  on the platform admin's Accounts page for the last 30 days.
- Migration `20261107090000_self_serve_sign_up`, reversible (rehearsed forward, back, forward).

## 28. Subscriptions and payments (public launch, Phase 5)

PayMongo isn't accepting new merchants yet, so everything is built and tested except the PayMongo
adapter itself.

- **Provider interface** (`src/server/subscription/providers/types.ts`): create a hosted
  checkout, request a renewal, verify and read a webhook. Connecting PayMongo (or Xendit) is one
  file implementing it, plus a line in `providers/index.ts`. Card details never reach Propfolio.
- **Demo provider** until then: a simulated hosted checkout inside the app ("Test payment: no real
  money moves") with buttons for card, GCash, Maya, a card whose next renewal fails, and a failed
  payment. Its messages are signed (key derived from `APP_SECRET`) and go through exactly the same
  webhook handling as a real provider's. **Refused on a production server that isn't the test
  site** (`NODE_ENV=production` without `UAT_MODE`), so nobody can "pay" with a pretend card;
  `PAYMENT_PROVIDER=none` hides online payment ("Email us" instead).
- **Payments drive the plan rules** (§26): a payment sets the account's plan and paid-until day,
  so access, limits and read-only need nothing new. Paying during the trial ends the trial and
  starts the paid month that day.
- **Checkouts** record the plan and amount on our side; a provider message only says "this
  payment was paid/failed", so a tampered message can't change what is granted. A checkout is
  claimed once (two deliveries racing can't both apply it).
- **Webhooks** (`/api/v1/subscription/webhook/<provider>`): signature checked (401 if wrong),
  every genuine message logged in `ProviderEvent` with what was done, and a repeated delivery is
  recognised by its event id and changes nothing.
- **States:** trialing, active, past due, cancelled (still paid up), free. Monthly periods run from
  the payment day to the day before the same date next month (31 Jan → 27 Feb; a period that
  starts at a month's end drifts to the shorter month's date, accepted for now).
- **Upgrade** (Pro → Premium) applies now and costs the difference for the days left
  (`upgradeCharge`); the period's end doesn't move. **Downgrade** waits for the period's end.
  **Cancel** keeps the plan to the period's end, then the account is on Free; "Keep this plan"
  undoes it until then.
- **Past due:** a failed renewal gives 7 days' grace (access continues: paid-until moves to the
  grace end), with emails on the failure and on grace days 3 and 6; then the subscription ends and
  the account is on Free under the §26 rules. Paying during the grace starts a new month that day.
- **Daily worker job** (07:00 Manila): renewals due, ending cancelled and unpaid subscriptions,
  grace reminders. Safe to run twice (one renewal request per period).
- **Emails** to the Owner: payment received, payment failed, plan changed (upgrade, downgrade
  scheduled), cancelled, moved to Free; the trial-ending emails exist since §26.
- **Payment records** (`SubscriptionInvoice`), numbered `PF-YYYY-NNNNNN` per year without gaps:
  number, date, customer name and address, plan, period, amount, method, provider reference.
  **Never labelled a BIR official invoice**; `src/server/subscription/invoicing.ts` is where
  BIR-compliant invoicing plugs in once the accountant decides. The Owner sees them on the Plan
  page; the platform admin's **Payments** page lists them and exports Excel for the bookkeeper
  (audited). Manual bank-transfer payments (platform admin) still set a paid-until day.
- **Billing is the Owner's** (new permission `billing.manage`, Owner only), allowed while
  read-only so an account over its limit can always upgrade.
- To connect PayMongo: implement `PaymentProvider` with its Checkout/Subscriptions API (hosted
  checkout for SUBSCRIBE/UPGRADE; for RENEWAL, map PayMongo's subscription invoice events to our
  RENEWAL checkout by the subscription's `providerRef`), verify `Paymongo-Signature` (HMAC-SHA256
  of `timestamp.body` with the webhook secret, rejecting old timestamps), add
  `PAYMENT_PROVIDER=paymongo` and the keys as secrets, then run the brief's ₱1,500 live test.

## 29. Teams (public launch, Phase 6)

- **Invitations** replace "Add user" with a temporary password: an Owner or Admin enters an email
  and a role; the person gets an email with a link that works for 7 days and once, and signs up
  themselves (name and own password, or Google with the invited email), accepting the legal
  documents. The link proves they can read that email, so no code step. Someone who already has a
  Propfolio sign-in (e.g. an outside accountant with another account) signs in and joins: one
  person, several accounts. Inviting the same email again replaces the old link; invitations can
  be withdrawn. The link is also shown to the inviter in case the email doesn't arrive.
- **Seats:** the plan's user limit (§26) counts active people **and open invitations**; the Users
  page shows "X of Y users". Joining checks the seat again (the plan may have changed).
- **Roles:** Owner, Admin, Leasing Staff, Property Management (read-only; also suits an outside
  accountant). Admins change roles and remove people ("Turn off account": the sign-in stops and
  the seat is freed; nothing is deleted, as everywhere in Propfolio).
- **Ownership transfer:** the Owner makes an active Admin the Owner and becomes an Admin, in one
  transaction (there is never a moment with no Owner or two). Both people's other sessions are
  signed out so they start again with their new role. Billing follows the Owner.
- **Audit:** invitations sent, withdrawn and accepted, role changes, turning off and on, and
  ownership transfers are all in the audit log.
- **Per-building access (not built, as asked):** add a `MembershipBuilding (membershipId,
buildingId)` table; a membership with no rows sees every building (today's behaviour), one with
  rows sees only those. Enforce it in the same two places as accounts: the database client's
  query filter (units, leases, tenants with a lease there, charges, payments, documents, reminders
  joined through the unit's building) and row-level security policies using a
  `current_building_ids()` setting next to `app.account_id`. Reports and exports then follow
  automatically; the Users page gets a building picker per person.

## 30. Public pages and launch readiness (public launch, Phases 7–8)

- **Public pages** (no sign-in, linked from the footer of the sign-in and sign-up pages): Pricing
  (built from the plan configuration, so it can't disagree with the app), Terms of Service,
  Privacy Policy, Data Processing Agreement, Refunds and cancellation, Contact.
- **Nothing that commits the business is invented.** How cancelling, downgrades, failed payments
  and the trial work is written out (it's how the product behaves); refund terms and the legal
  texts say "[LAWYER TO SUPPLY]"; business details (registered name, registration and TIN,
  address, phone, data-hosting location) live in `src/domain/legal/company.ts` and say
  "[TO SUPPLY …]" until filled in. The contact email is `SUPPORT_EMAIL`.
- **Launch readiness:** `docs/launch-checklist.md`, each item done, partly done or not done, with
  what is left and who does it. The phone walk-through is automated on a simulated Pixel 7.

## 31. The public website (11 Nov 2026)

- **"/" shows the website to signed-out visitors** (`src/proxy.ts` rewrites it to `/welcome`);
  signed-in people still get their dashboard at "/". Other app pages still send signed-out
  visitors to sign in.
- **Pages:** Home, Product, Pricing (with a plan picker built on the same limits the app enforces),
  Customers, Help centre (searchable FAQ), About, Security and privacy, Contact and Book a demo.
  All words live in `src/domain/marketing/content.ts`.
- **Placeholders are labelled on the page:** customer stories, the founder's story and team, and
  business details show "Placeholder" or "[TO SUPPLY …]" until real ones are given. The Security
  page lists only what Propfolio does today.
- **Book a demo** is stored in Propfolio (`DemoRequest`, platform admin only, removed after a
  year), emailed to `SUPPORT_EMAIL`, rate-limited to 5 an hour per address, with a hidden field
  to catch bots. A calendar booking link can replace or follow it later.
- Branding (teal, Inter) and the headline are drafts.

## 32. More website pages (11 Nov 2026)

- **For each kind of property** (`/for/residential`, `/for/commercial`, `/for/industrial`): the
  reminder lead times shown come from the app's own defaults, so they can't drift.
- **Propfolio vs Excel** (`/compare/excel`), **What's new** (`/whats-new`), **Guides and
  templates** (`/resources`, three guides). The guides are general information, not legal
  advice, and say so.
- **Free Excel lease tracker:** name and email first (stored as a `WebsiteLead`, news only if
  they tick the box), then the download. The file holds no customer data.
- **Partners** (`/partners`): an application form, emailed to `SUPPORT_EMAIL`. The reward is a
  placeholder until decided.
- **Status** (`/status`): live checks of the database and the daily reminder job, in words. It
  runs on the same server, so if the server is down the page is too: an outside status service
  (e.g. a free uptime monitor) is the next step.
- Partner applications and template requests are in the platform admin under "Partners and
  downloads", kept a year.
