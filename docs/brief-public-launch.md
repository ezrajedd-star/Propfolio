# Propfolio — Build Brief: Public Launch (Free, Pro, Premium + PayMongo billing)

_Paste this into Claude Code, in the Propfolio repository. Written 2 Nov 2026._

---

## Who you're working with

I'm the founder of Propfolio. I'm not a developer. Explain every decision in plain language,
explain jargon the first time you use it, and tell me when something is risky or when I need to
decide.

## What Propfolio is today

Propfolio is a lease-management web app for Philippine lessors. It works on laptops and phones.
Right now it serves **one company only**: there's no sign-up, there are no separate customer
accounts, and there's no billing. A test version is running with made-up data, and one real
estate company is testing it.

Existing features: buildings, units and tenants; leases with a 4-step form, renewals and automatic
statuses; a spreadsheet-style leases table with Excel/CSV export; a calendar; a daily 6 AM
(Manila) reminder email with lead times per property type; rent schedules with escalations,
deposits and advance rent; payments applied oldest-first, credits and voids; an overdue list with
aging; a printable payment acknowledgement (clearly "not an official receipt"); private document
storage with 5-minute links and view logging; six reports; Data Privacy Act features (privacy
notice, tenant data export, anonymisation, retention); three roles (Admin, Leasing Staff,
Property Management read-only) checked on the server; lockout; a 30-minute idle timeout; and an
audit log that cannot be edited.

## The goal

Open Propfolio to the public as a self-serve subscription product:

- **Free plan** for up to 3 units.
- **Pro** and **Premium** paid plans.
- **Every new account gets Premium free for 30 days**, with no card required.
- **Monthly billing through PayMongo**, by card, GCash or Maya.
- **Security strong enough for many companies' real tenant data.**

## How to work

1. **Phase by phase.** Do one phase, then stop. Give me a plain-language summary of what changed,
   how to check it, and anything I need to decide. Wait for my approval before starting the next
   phase.
2. **Start with Phase 0** (inspect and plan). Don't change code in Phase 0.
3. **Protect the existing data.** The company already testing Propfolio becomes the first customer
   account. Their data must come through every change intact. Write each data migration so it can
   be reversed, and test it on a copy first.
4. **Write tests** for everything security-related and money-related. Tests must pass before you
   report a phase done.
5. **No secrets in the code.** API keys and passwords go in environment settings. **Use PayMongo
   test mode only.** I don't have live keys yet; my business registration is in progress.
6. **Keep prices, plan limits and trial length in one configuration place,** not scattered
   through the code. They will change.
7. **Don't build what's out of scope** (see the end of this brief). If something seems necessary
   but isn't listed, ask me first.

---

## Phase 0 — Inspect and plan (no code changes)

Read the codebase and give me:

- The tech stack and hosting, in plain words.
- How the data is structured today, and how much work separate customer accounts will take.
- Your plan for Phases 1–8: the order, a rough effort for each in days, and the risks.
- Anything in this brief that conflicts with how the app is built, and your recommendation.
- A list of questions for me.

## Phase 1 — Separate customer accounts (the foundation)

This is the most important phase. **No customer may ever see or change another customer's data.**

- Add an **Account** (one customer company or person). Every record belongs to exactly one
  account: buildings, units, tenants, leases, charges, payments, documents, reminders, reports,
  audit entries, settings and saved table layouts.
- **Enforce account separation on the server, for every request,** including exports, reports,
  file downloads, the reminder email job and background jobs. Don't rely on the screen hiding things.
- **Automated tests** where a user of account A tries to read, edit, export or download account B's
  data by every route. All attempts must fail.
- **Move the existing company's data into Account #1.**
- Settings that are company-wide today become per-account settings: reminder lead times, retention
  period, and the lessor's name and details in the tenant privacy notice. The lessor is the
  personal information controller for their tenants, so the notice must name them, not Propfolio.
- Add a **platform-admin area for me only** (with two-step sign-in, and every action audited). It
  lists accounts with plan, trial end and status, and lets me extend a trial, record a manual
  payment ("paid until" date), and suspend an account. It shows account-level information only;
  it must not let me browse customers' tenant records.

## Phase 2 — Security hardening

- Two-step sign-in with an authenticator app (time-based codes): required for Admins and the
  platform admin, optional for other users, with one-time recovery codes.
- Rate limits on sign-in, sign-up, password reset and invitation endpoints. Keep the existing lockout.
- Passwords of at least 12 characters, checked against a list of breached passwords.
- Encryption at rest for the database and file storage (confirm with the hosting provider and tell me).
- Automatic daily encrypted backups to a separate provider or region, kept 30 days. Write down the
  restore steps and do one test restore.
- Uploads: check the real file type (not just the extension), and scan for viruses.
- Update all dependencies and turn on automatic vulnerability alerts.
- Security headers, HTTPS only, secure cookies.
- Error tracking, uptime monitoring, and an alert for bursts of failed sign-ins.
- A staging environment separate from production.
- At the end: a short **security summary document** I can give to an outside penetration-testing
  firm, describing what exists and where.

## Phase 3 — Self-serve sign-up and onboarding

**The standard is Netflix or Canva, not "ask IT for an account."** Today, an Admin creates each
user's account by hand. That stays only for adding teammates inside a customer's account
(Phase 6). For a new customer, **no human from Propfolio is ever involved**: no approval, no
waiting, no email to me.

**The customer journey (target: under 2 minutes from landing page to inside the app, on a phone):**

1. A visitor taps "Start free" on the website or the app's sign-in page.
2. They sign up with **Google** (one tap) **or** with email and password. Ask only for name, email,
   password (if not Google) and the name they lease under (company or personal). Nothing else.
3. They tick one box accepting the Terms of Service, Privacy Policy and Data Processing Agreement.
4. **Email verification by a 6-digit code** typed on the same screen, so they don't have to leave
   the app to click a link. Google sign-ups are already verified.
5. They land straight in the app, with the 30-day Premium trial already running and the
   onboarding steps below waiting for them.

**Requirements:**

- **Sign-in page for everyone:** "Continue with Google" or email and password, plus "Forgot
  password?" that works by itself (reset link by email, expiring after 1 hour). Remove any wording
  or flow that assumes one company, such as a company logo, "contact your administrator", or an
  admin-only way to create users.
- **Accounts link correctly:** if someone signs up with Google using an email that already has an
  account, sign them into that account rather than creating a duplicate.
- **Staying signed in:** remember the device for 30 days if the user chooses. Keep the 30-minute
  idle timeout for Admins on shared computers as an account setting, on by default.
- **Bot check** on the sign-up form (for example Cloudflare Turnstile), invisible to most people.
- **Two-step sign-in** (Phase 2) is set up during onboarding for Owners and Admins, with a clear
  explanation of why. Don't make it the first thing they see.
- **Clear, friendly errors** in plain words ("That email already has an account. Sign in instead?").
- **Track the journey:** count how many people start sign-up, verify their email, add a unit and
  add a lease. Show these numbers in my platform-admin area, so I can see where people drop off.
- **Legal documents are versioned.** Record which version of each document a user accepted, and
  when. Use placeholder pages for now; my lawyer will supply the text. When I publish a new
  version, ask users to accept it at their next sign-in.
- Sign-up creates the account with its first user as **Owner** (a new role: an Admin who also
  controls billing and can't be removed), and starts the 30-day Premium trial.
- **Tests** for the whole journey, including a duplicate email, a wrong verification code, an
  expired reset link and a Google sign-up.
- **First-run onboarding:**
  1. Add your first building.
  2. Import from Excel, or add units by hand.
  3. Add a lease.
  4. See your first reminder.

  Keep the existing welcome tour and Guide button.

- **Excel import:**
  - A downloadable template for buildings, units, tenants and leases (with rent, escalation,
    deposit and advance rent).
  - Upload, then a preview that shows errors row by row in plain language.
  - Nothing is saved until the whole file is valid.
  - The import respects the account's plan limits.

## Phase 4 — Plans, limits and the trial

Put this in one central configuration:

|                 | Free | Pro                         | Premium                                                |
| --------------- | ---- | --------------------------- | ------------------------------------------------------ |
| Price per month | ₱0   | ₱1,500                      | **[TO DECIDE, suggest ₱3,500]**                        |
| Units           | 3    | **[TO DECIDE, suggest 50]** | **[TO DECIDE, suggest 200; above that, "contact us"]** |
| Users           | 1    | 1                           | **[TO DECIDE, suggest 5 included]**                    |

Features by plan (each higher plan includes everything below it):

- **Free:** buildings, units, tenants, occupancy; leases; calendar; daily reminder email (default
  lead times); rent schedules with escalations, deposits and advance rent; spreadsheet-style table;
  Excel/CSV export of leases; Excel import; all privacy tools.
- **Pro:** custom reminder lead times per property type; payments, credits and voids; overdue list
  with aging; printable payment acknowledgement; the six reports.
- **Premium:** more than one user, with roles; document storage; the audit log screen. Later, the
  planned commercial features (2307, post-dated cheques, VAT, CUSA) go here.

Rules:

- **Check plan permissions on the server,** like roles. Locked features stay visible in the menu
  with a small lock and a short "Available on Pro/Premium" message with an Upgrade button. That
  shows people what they'd gain.
- **Trial:** new accounts get Premium for 30 days. Show the days left in the app. Send reminder
  emails 7 days and 1 day before the trial ends.
- **When a trial or paid plan ends, nothing is ever deleted.** The account moves to Free, and:
  - Everything stays visible.
  - **Export and all privacy tools always keep working.**
  - If the account has more than 3 units, it becomes read-only (no adding or editing) until it
    upgrades or reduces to 3 units.
  - Existing documents stay viewable and downloadable, but no new uploads are allowed.
  - Extra users can no longer sign in (suspended, not deleted). The Owner keeps access.
  - Payment records stay as they are.
- Upgrading restores everything immediately.

## Phase 5 — Billing with PayMongo (test mode)

- Build billing behind a **payment-provider interface,** so Xendit could replace PayMongo later
  without rewriting the app.
- Use the **PayMongo Subscriptions API** with plans for Pro and Premium (monthly). Customers pay
  through PayMongo's hosted checkout with card, GCash or Maya. Propfolio never stores card
  details.
- **Webhooks:** verify PayMongo's signature, handle repeat deliveries safely (idempotency), and
  log every event.
- **Subscription states:** trialing, active, past due, canceled, free.
  - **Past due:** 7-day grace period with email reminders, then a move to Free under the Phase 4
    rules.
- **Billing page (Owner only):**
  - Current plan, next charge date and amount, and payment history.
  - Change plan (upgrade takes effect now; downgrade takes effect at the end of the paid period).
  - Cancel (takes effect at the end of the paid period).
- **Emails:** trial ending, payment received, payment failed, plan changed, moved to Free.
- **Invoice records:** for every payment, store an invoice record (number, date, customer name and
  address, plan, amount, payment method, PayMongo reference). Give me an export for my bookkeeper.
  **Don't label anything as a "BIR official invoice"** until my accountant confirms the invoicing
  method. Leave a clear place in the code to plug in BIR-compliant invoicing later.
- **Manual payments:** from the platform-admin area, I can record a bank-transfer payment that sets
  a "paid until" date. This is for annual or corporate customers.
- **Tests** for every state change, including failed payments, a repeated webhook, and upgrading
  in the middle of a cycle.

## Phase 6 — Teams and roles (Premium)

- The Owner or an Admin invites people by email. Invitations expire after 7 days. The invited
  person follows the same easy sign-up (Google or email and password) and lands straight inside
  their team's account; nobody types a password for them.
- Roles: **Owner** (new, one per account), **Admin**, **Leasing Staff**, and **Property Management
  (read-only)**. The read-only role also suits an outside accountant.
- Enforce the seat limit from the plan configuration. Show "X of Y users".
- Admins can remove users or change their role. The Owner can transfer ownership to another Admin.
- Every team change goes into the audit log.
- **Don't build per-building access limits now.** Design the data so it can be added later (for
  property managers who serve several owners), and tell me how you'd do it.

## Phase 7 — Public pages the payment partner checks

PayMongo reviews the website before activating live payments. Inside the app (or as simple static
pages), make sure these exist, each with placeholder text marked "[LAWYER TO SUPPLY]" where needed:

- Pricing (pulled from the plan configuration)
- Terms of Service
- Privacy Policy
- Data Processing Agreement
- Refund and cancellation policy
- Contact details

Separately, I'll ask for a full marketing website later.

## Phase 8 — Launch readiness

Give me a checklist showing each item as done or not done:

- Every phase complete, with tests passing.
- A backup restore tested.
- Monitoring alerts working.
- The penetration-test findings fixed (after the outside test).
- PayMongo live keys switched in.
- One real ₱1,500 payment made and refunded.
- A full walk-through on a phone: sign up, import, trial, upgrade, downgrade, cancel.

---

## Out of scope for now (don't build)

- BIR Form 2307 tracking, post-dated cheques, VAT, CUSA, utilities, percentage rent
- Collecting rent from tenants online
- A tenant portal
- A native mobile app
- Per-building access limits
- Annual billing through PayMongo (manual bank transfer covers it for now)

## Decisions I still need to make (ask me when you reach them)

1. Premium price, and the unit limits for Pro and Premium.
2. The number of users included in Premium, and whether to sell extra seats.
3. How long to keep data after a customer closes their account (suggestion: 90 days, with an
   export reminder, then deletion).
4. The BIR invoicing method (my accountant will decide).
5. Where the data is hosted, to state in the Privacy Policy.
