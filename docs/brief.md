# Build Prompt: Lease Management System (Leasing Department)

> **How to use this file:** Give this whole document to Claude Code as the project brief. Claude Code should read it fully, propose an implementation plan, confirm the assumptions in Section 14, and then build in the phases described in Section 12.

---

## 1. Project Summary

Build a web-based **Lease Management System** for a real estate leasing company in the Philippines. It replaces an old, unmaintained "Contract Scheduler" that only tracked contract expiry dates and sent email reminders.

The new system must:

1. Keep a register of **buildings, rental units, tenants and leases**.
2. Show the same lease data in two linked views: a **calendar** and a **spreadsheet-style grid** inside the app.
3. Email reminders to the Leasing Department before leases expire, with reminder timing that **depends on the unit**.
4. Track **rent schedules, actual payments and overdue balances**.
5. Store signed contract documents.
6. Produce simple reports.
7. Meet the **minimum requirements of the Philippine Data Privacy Act of 2012 (RA 10173)**.

**The most important requirement is ease of use.** Many users are not tech-savvy. Every screen should be simple, calm, readable and forgiving of mistakes, and it should still look modern and polished.

---

## 2. Users and Roles

Only the **Leasing Department** manages leases. **Property Management** gets read-only access to occupancy information.

| Role                             | Who                         | Permissions                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**                        | Leasing head / system owner | Everything Leasing Staff can do, plus: manage user accounts, manage buildings, units, unit types and reminder defaults, system settings, view the audit log, run data-privacy actions (export or anonymise a tenant's data), permanently purge archived records |
| **Leasing Staff**                | Leasing Department staff    | Create, edit and renew leases; manage tenants; record payments; upload documents; mark reminders as handled; run reports; **archive** records (no permanent delete)                                                                                             |
| **Property Management (Viewer)** | Property Management staff   | **Read-only** view of buildings, units, occupancy status, and lease start/end dates per unit. They see the **tenant's display name only**. They must NOT see tenant contact details, financial data, payments or documents (data minimisation under the DPA)    |

Rules:

- **Reminder emails go to every active user with the Admin or Leasing Staff role.** Viewers never receive reminders.
- Users cannot change their own role.
- Accounts are created by an Admin. There is no public sign-up.
- On first login, the user must set a new password.

---

## 3. Recommended Tech Stack

Use this stack unless there is a strong reason not to. If you change anything, explain why before you start.

- **Framework:** Next.js (App Router) with TypeScript
- **Database:** PostgreSQL with the Prisma ORM
- **UI:** Tailwind CSS with shadcn/ui components and lucide-react icons
- **Calendar:** FullCalendar (React)
- **Grid:** TanStack Table, or AG Grid Community, with in-line cell editing
- **Forms and validation:** React Hook Form with Zod. The same Zod schemas must be used on the server.
- **Auth:** Auth.js (credentials provider), argon2 password hashing, database sessions
- **Email:** Nodemailer over SMTP, configured through environment variables; React Email for templates
- **Scheduled jobs:** a daily job runner (pg-boss or node-cron in a worker process) for reminders, status updates and overdue calculations
- **File storage:** S3-compatible storage (local filesystem adapter in development); private bucket with short-lived signed URLs
- **Exports:** CSV and XLSX (e.g. exceljs)
- **Testing:** Vitest for unit tests (especially date and money logic); Playwright for the main user flows
- **Deployment:** Docker Compose (app, worker, Postgres) and a `.env.example` file

Locale defaults:

- Timezone **Asia/Manila**
- Currency **PHP**, formatted as `₱12,500.00`
- Date display `23 Oct 2026`

Store money as integers (centavos) or as Decimal, **never as floats**.

---

## 4. Data Model (starting point)

Refine as needed, but keep these concepts. All tables include `createdAt`, `updatedAt`, `createdById` and `updatedById`. Use soft delete (`archivedAt`) wherever records can be archived.

### Property structure

- **Building**: name, code, address, type (Commercial / Residential / Industrial complex / Mixed), notes
- **UnitType**: name (e.g. Office, Retail, Residential, Warehouse, Lot), plus **default reminder settings** (see Section 6)
- **Unit**: building, unit number/name, unit type, floor (optional), floor area (sqm), standalone structure flag (e.g. warehouse), manual status override (`UNDER_RENOVATION` / `UNAVAILABLE` / none), **reminder settings override** (optional; inherits from the unit type when empty), notes
  - **Calculated occupancy:** `OCCUPIED` if the unit has an active lease today; otherwise `VACANT`, unless a manual override is set.

### Parties

- **Tenant**: type (Company / Individual), display name, registered name, TIN (optional), contact person, phone, email, billing address, notes, privacy notice acknowledged (date and method), `anonymizedAt`
  - One tenant can have many leases.

### Leases

- **Lease**: reference number (auto-generated, e.g. `LSE-2026-0001`), unit, tenant, start date, end date, **duration** (calculated and displayed, never typed in), status, `previousLeaseId` (renewal chain), monthly rent, rent due day (1–28), security deposit, advance rent (months or amount), escalation rule (none / % every N months / fixed amount on dates), remarks
  - **Statuses:**
    - `ACTIVE`
    - `EXPIRING`: today is inside the first reminder window
    - `EXPIRED`: end date passed, not renewed or terminated
    - `RENEWED`: a newer lease has replaced this one
    - `TERMINATED`: ended early, with a date and reason
    - `DRAFT` (optional)
  - Status is calculated from dates and actions. The daily job keeps it in sync, and every read must also be correct on its own.
  - A unit cannot have two leases with overlapping active periods. Block this with a clear message.
- **LeaseRenewal behaviour:** "Renew" creates a **new lease record** linked to the old one through `previousLeaseId`. The form is pre-filled from the old lease, with the new start date set to the old end date + 1 day. The old lease becomes `RENEWED`. The full renewal history is visible on the lease page as a simple timeline.

### Money

- **Charge**: lease, type (Rent / Deposit / Advance / Other), period (month), due date, amount, description. Monthly rent charges are **generated automatically** from the lease terms, including escalations, for the whole lease term. When lease terms change, future unpaid charges are regenerated; paid or partly paid charges are never changed silently.
- **Payment**: lease (or tenant), date received, amount, method (Cash / Cheque / Bank transfer / Online), reference no. (OR no., cheque no.), notes. Payments are **allocated to the oldest unpaid charges first**, and staff can adjust the allocation manually.
- **Balances**: outstanding per charge, per lease and per tenant. A charge is **overdue** when its due date has passed and it is not fully paid. Show aging buckets: 1–30, 31–60, 61–90, 90+ days.
- Corrections must be made as **voids or reversals with a reason**, never as silent deletion.

### Documents

- **Document**: lease (or tenant), file, file name, category (Signed contract / Amendment / ID / Other), uploaded by, uploaded at
  - Allowed types: PDF, JPG, PNG, DOCX
  - Maximum size: 20 MB

### Reminders

- **ReminderEvent**: lease, scheduled date, type (Expiry / Repeat), sent at, recipients, status (Pending / Sent / Failed / Skipped)
- **Lease reminder state**: `handledAt`, `handledById`, `handledNote`. "Mark as handled" stops all further expiry reminders for that lease.

### System

- **User**: name, email, role, active flag, `mustChangePassword`, last login, failed login count, `lockedUntil`
- **AuditLog**: who, when, action, entity, entity ID, changed fields (before/after), IP address. Append-only.
- **Setting**: key/value system settings, e.g. company name, sender email, data retention period

---

## 5. Core Screens and Navigation

Keep the navigation **short and labelled with plain words and icons**. Sidebar on desktop; bottom bar or menu on mobile.

1. **Home**
2. **Calendar**
3. **Leases** (the grid)
4. **Units**
5. **Tenants**
6. **Payments**
7. **Reports**
8. **Settings** (Admin only: Users, Buildings and Units, Unit Types and Reminders, Privacy, Audit Log)

Viewers only see **Home** (an occupancy version), **Units** (read-only) and **Calendar** (lease start/end events only, tenant display name only).

### 5.1 Home (Dashboard)

- Greeting, plus a short "What needs your attention today" list:
  - Leases expiring soon, reminders not yet handled, overdue payments
  - Each item has a one-click action ("Open lease", "Mark handled", "Record payment")
- Four large summary cards, each clickable and opening a filtered list:
  - Active leases
  - Expiring in the next 90 days
  - Expired / not renewed
  - Total overdue (₱)
- Occupancy by building: simple bars showing occupied / vacant / unavailable
- Upcoming expiries for the next 90 days, as a short list

### 5.2 Calendar

- Month view by default; Week and Agenda (list) views available
- Events:
  - Lease end dates (main event)
  - Reminder dates
  - Lease start dates
  - Rent due dates (can be toggled on/off; off by default to avoid clutter)
- Colour coding **always paired with a text label or icon**:
  - Green = active
  - Amber = expiring
  - Red = expired / overdue
  - Grey = renewed / terminated
- Filters: building, unit type, status, event type
- Clicking an event opens a **side panel** with the key lease details and buttons: "Open lease", "Renew", "Mark reminder handled"
- Simple "Today" and Prev/Next buttons. Avoid confusing controls.

### 5.3 Leases (spreadsheet-style grid)

- One row per lease
- Columns: Ref No., Building, Unit, Tenant, Start, End, Days left, Monthly rent, Balance due, Status, Reminder status
- Users can show, hide and reorder columns; their layout is remembered per user
- **In-line editing** for simple fields: remarks, contact person, rent due day
  - Each edit is validated immediately and saved automatically
  - A small "Saved ✓" confirmation appears, and an **Undo** option is available for a few seconds
- **Critical fields require the form, not in-line editing:** dates, rent amount, tenant, unit. The user changes these through a clear form with a confirmation step, because they affect charges and reminders.
- Calendar and grid share the same data: an edit in one appears in the other immediately
- Search box with **forgiving search**: case-insensitive, partial matches, searches tenant, unit, building and reference number. The old system needed exact spelling; do not repeat that.
- Quick filter chips: "Expiring in 30 / 60 / 90 days", "Overdue", building, unit type, status
- Group by building (toggle)
- Export the current view to **Excel or CSV**
- Row actions use a visible "⋯" menu on each row (View, Edit, Renew, Record payment, Archive). **Do not** use the old pattern of ticking a checkbox and then clicking a toolbar button.
- Bulk select is only used for export and archive

### 5.4 Lease detail page

- Header: tenant, unit, building, status badge, days remaining, big primary action button (e.g. "Renew lease")
- Tabs:
  - **Overview**
  - **Payments** (charges, payments and balance in one clear ledger)
  - **Documents**
  - **Reminders** (scheduled and sent reminders, plus a "Mark as handled" control)
  - **History** (renewal chain timeline and audit entries)

### 5.5 New lease: guided form

Use a **step-by-step wizard**, with progress shown as "Step 2 of 4":

1. **Unit**: pick building, then unit. Only vacant units are shown by default, with a toggle to show all.
2. **Tenant**: pick an existing tenant or add a new one in place. Show the privacy notice acknowledgement checkbox for new tenants.
3. **Terms**: start/end dates, with the duration shown automatically ("2 years, 0 months"); rent; due day; deposit; advance; escalation.
4. **Review and save**: a plain-language summary, including the reminder schedule inherited from the unit, e.g. "We will email the Leasing team on 2 Aug, 1 Sep and 1 Oct 2027."

Rules:

- Required fields are marked clearly
- Errors appear next to the field in plain language
- Drafts are kept if the user navigates away

### 5.6 Units

- List grouped by building, with occupancy badge, unit type, current tenant and lease end date
- The unit page shows: details, current lease, lease history, and **reminder settings** (inherited from the unit type, with an "Override for this unit" option)

### 5.7 Tenants

- List and detail pages: contact info, all leases (current and past), total balance, documents
- Privacy actions (Admin only): export the tenant's data, correct it, anonymise it

### 5.8 Payments

- **Record payment** form:
  - Pick lease or tenant → see outstanding charges → enter amount → system suggests the allocation → save
  - Show a printable/downloadable acknowledgement summary. This is not an official receipt; label it as such.
- **Overdue list**: tenant, unit, amount overdue, oldest due date, aging bucket; exportable
- **Void payment**: requires a reason and is logged in the audit trail

### 5.9 Reports

All reports can be filtered by building, unit type and date range, and exported to Excel/CSV.

1. **Expiry pipeline**: leases ending in the next 30/60/90/180 days
2. **Occupancy**: occupied, vacant and unavailable units by building, with occupancy %
3. **Rent roll**: active leases with rent, deposit and term
4. **Collections**: payments received in a period
5. **Overdue aging**: balances by aging bucket, per tenant
6. **Renewal history**: renewed vs expired vs terminated in a period

### 5.10 Settings (Admin)

- **Users**: create, edit, deactivate, reset password (sends a reset email)
- **Buildings and Units**: create and edit
- **Unit Types and Reminder Defaults**: see Section 6
- **Privacy**: privacy notice text, data retention period, purge of archived records past retention
- **Audit Log**: searchable and filterable; read-only

---

## 6. Reminder Rules

Reminder settings follow a simple inheritance chain:

**System default → Unit type default → Unit override**

A reminder configuration has two parts:

- **Lead times**: a list of "days before end date". Example defaults:
  - Residential `[60, 30, 7]`
  - Office/Retail `[90, 60, 30]`
  - Warehouse/Industrial `[180, 120, 90, 60, 30]`
- **Repeat after the last lead time** (optional): None / Weekly on a chosen weekday / Daily. Repeats continue until the end date, and optionally for a set number of days after expiry, until the lease is **marked as handled**, renewed or terminated.

Behaviour:

1. When a lease is created, its reminder dates are calculated from the unit's **effective** settings. The Reminders tab shows them in plain words.
2. If a unit's settings change later, recalculate the **future** reminder dates for its active leases.
3. The daily job (06:00 Asia/Manila) sends that day's due reminders to **every active Admin and Leasing Staff user**.
4. **One digest email per day**, not one email per lease. The digest lists every lease that needs attention, each with a direct link. Subject example: `Lease reminders – 3 leases need attention (23 Oct 2026)`.
5. The digest also includes a short **overdue payments** section (count, total and a link). This can be switched off in Settings.
6. Renewing, terminating or marking a lease as handled stops its expiry reminders.
7. Failed sends are retried and logged. Admins can see failures on the Settings page.
8. **No escalation and no approval workflows.** These are out of scope.

---

## 7. UI/UX Principles (non-negotiable)

Users may not be tech-savvy. Design for a busy, careful person who uses the system a few times a week.

- **Plain language everywhere.**
  - "Lease ends in 45 days", not "T-45 EXP"
  - Buttons say what they do: "Record payment", "Renew lease"
- **One primary action per screen**, visually obvious. Secondary actions are quieter.
- **Large, readable UI:** base font size 16px or larger, generous spacing, click targets of at least 40px, high contrast (WCAG 2.1 AA)
- **Never rely on colour alone.** Always pair it with a label or icon.
- **Forgiving:**
  - Confirm destructive actions in plain words
  - Offer **Undo** after edits and archives
  - Archive instead of delete
  - Autosave drafts
- **Helpful empty states:** e.g. "No leases yet. Add your first lease →"
- **Short inline help:** small "?" tooltips on financial and reminder fields
- **Consistent layout:** same page structure, the same button positions, the same words for the same things
- **Fast feedback:** loading skeletons, a "Saved ✓" toast, and clear error messages that suggest a fix
- **Responsive:** works on a laptop first and is usable on a tablet or phone (calendar agenda view and lease lookup especially)
- **Look and feel:** clean, modern and calm
  - Neutral background with one brand accent colour; light theme by default
  - Subtle shadows, rounded corners, a clear typographic hierarchy
  - No clutter, no dense toolbars
- **Keyboard accessible**, with visible focus states

---

## 8. Data Privacy Act (RA 10173): Minimum Requirements

Build these in from the start.

1. **Proportionality:** collect only the tenant fields listed in this brief. No ID numbers beyond TIN, and the TIN is optional.
2. **Privacy notice:** configurable text, shown when a new tenant is added; the acknowledgement date and method are recorded.
3. **Access control:** enforce role-based access **on the server** (never just by hiding UI). Viewers never receive tenant contact, financial or document data from the API.
4. **Security:**
   - HTTPS only; encryption at rest for the database and file storage
   - argon2 password hashing; minimum 10-character passwords
   - Account lockout after 5 failed attempts for 15 minutes
   - Session timeout after 30 minutes of inactivity
   - Secure, httpOnly cookies; CSRF protection
   - Documents served only through short-lived signed URLs, after a permission check
5. **Audit trail:** log creates, updates, archives, logins, failed logins, document downloads, exports and privacy actions. Append-only; visible to Admins.
6. **Data subject rights (Admin):**
   - **Export** all data held about a tenant (JSON/PDF)
   - **Correct** it
   - **Anonymise** a tenant: replace personal fields with placeholders while keeping financial totals for accounting integrity
7. **Retention:** configurable retention period for archived leases and tenants. Admins get a screen listing records past retention, with a purge/anonymise action.
8. **Breach readiness:** logs must contain enough detail to support NPC breach notification (72 hours). Document this in the README.
9. **Account notifications:** email the user when their password or email changes.

_(The client's DPO or counsel should confirm the final retention period and the privacy notice wording. Make both configurable.)_

---

## 9. Business Rules Checklist

- The end date must be after the start date. Duration is always calculated, never typed in.
- No overlapping active leases on the same unit.
- Rent due day must be between 1 and 28.
- Status is calculated from dates and actions. The daily job re-checks all statuses.
- Renewal creates a new linked lease, and the old lease becomes `RENEWED`.
- Termination requires a date and a reason. Future unpaid charges after the termination date are cancelled, and the cancellation is logged.
- Payments are allocated to the oldest unpaid charges first, and can be adjusted manually.
- Payments and charges are never hard-deleted; they are voided with a reason.
- Changing lease terms regenerates only **future, unpaid** charges, and the user is shown what will change before confirming.
- All timestamps are stored in UTC and displayed in Asia/Manila time.

---

## 10. Out of Scope (for now)

- **Data migration / bulk import from the old system.** This is deferred because the data needs cleaning first. Still, design the schema with import in mind, and keep the reference numbers and natural keys clean.
- Approval workflows and reminder escalation
- SMS, Viber or other non-email notifications
- Tenant self-service portal and online payments
- Maintenance or work-order management (Property Management's domain)
- Official receipts or BIR-compliant invoicing
- Multi-company or multi-department support

---

## 11. Seed Data and Developer Experience

- Provide a seed script with:
  - 3 buildings (one industrial complex with standalone warehouse units)
  - About 30 units across the unit types
  - About 20 tenants and about 25 leases in mixed states (active, expiring, expired, renewed chain, terminated)
  - Charges and payments that include overdue balances
  - One user per role
- Provide a `README.md` covering: setup, environment variables, running the app and the worker, how reminders work, how to test email locally (Mailpit/MailHog in Docker Compose), backup notes and DPA notes.
- Seed users must use **generated test credentials**, documented in the README or seed file, never real passwords.

---

## 12. Build Phases and Acceptance Criteria

Work in phases. At the end of each phase:

- Run the tests
- Summarise what was built
- List anything that is uncertain

**Phase 1: Foundation**

- Project setup, auth, roles, user management, audit logging, layout and navigation, design system
- ✅ Admin can create users
- ✅ First-login password change works
- ✅ Lockout works
- ✅ Viewers cannot access restricted pages or API routes

**Phase 2: Property and lease register**

- Buildings, unit types, units, tenants, lease wizard, lease detail page, renewal, termination, calculated statuses and occupancy
- ✅ A lease can be created in ≤ 4 clear steps
- ✅ Overlap is blocked
- ✅ Renewal creates a linked lease
- ✅ Statuses are correct for seeded edge cases

**Phase 3: Calendar and grid**

- FullCalendar views, the leases grid with in-line editing, filters, saved column layouts, export
- ✅ An edit in the grid shows on the calendar without a page reload
- ✅ Forgiving search finds "abc corp" when the record says "ABC Corporation"

**Phase 4: Reminders**

- Reminder inheritance, schedule calculation, daily job, digest email, "Mark as handled", failure logging
- ✅ Unit tests cover the inheritance chain and date calculations (including month ends and leap years)
- ✅ The digest is sent to all Leasing users and never to Viewers

**Phase 5: Payments**

- Charge generation with escalation, payment recording and allocation, balances, aging, voids
- ✅ Money maths has unit tests
- ✅ Overdue totals match between the dashboard, the lease page and the report

**Phase 6: Documents, reports and privacy**

- Document upload/download, the six reports, privacy export/anonymise, retention screen
- ✅ Viewer API responses contain no tenant contact or financial fields (covered by tests)

**Phase 7: Polish**

- Accessibility pass, responsive pass, empty states, help tooltips, Playwright end-to-end flows for the top 5 tasks:
  - Add a lease
  - Renew a lease
  - Record a payment
  - Find expiring leases
  - Mark a reminder as handled

---

## 13. Definition of Done

- A non-technical Leasing staff member can, without training, use the system to:
  - Find a lease
  - See what is expiring
  - Record a payment
  - Renew a lease
- All role restrictions are enforced on the server.
- Reminder and money logic is covered by automated tests.
- The app runs with `docker compose up` and the documented environment variables.
- No hard-coded secrets; `.env.example` is complete.

---

## 14. Assumptions to Confirm Before Building

Ask me about these first if they affect your plan. Otherwise, proceed with the defaults shown.

1. Default reminder lead times per unit type (Section 6). These are placeholders pending confirmation by the Leasing Department.
2. Reminder digest time: 06:00 Asia/Manila.
3. Repeat reminders continue for 30 days after expiry if the lease has not been handled.
4. Hosting target: Docker on a cloud VM, using a managed Postgres and S3-compatible storage.
5. Brand colours and logo will be supplied later. Use a neutral palette with a single blue/teal accent until then.
6. Penalties or interest on overdue rent are **not** calculated automatically in this version.
