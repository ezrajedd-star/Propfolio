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
