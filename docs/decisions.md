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
