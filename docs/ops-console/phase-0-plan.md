# Operations console and AI agents: Phase 0 (inspection and plan)

_25 Nov 2026. No code was changed in this phase. Prices were checked on 25 Nov 2026 from
public pages and may change; each is marked with its source in the chat summary._

---

## 1. What exists today

### Platform-admin area (`/platform`)

| Already there                          | Notes                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Staff sign-in, separate from customers | Own table (`PlatformAdmin`), own sessions and cookie (`SameSite=Strict`). Password **and** two-step sign-in always. 30 minutes idle, 8 hours maximum.        |
| Adding staff                           | Only from the server's command line (`docker compose run --rm platform-admin`), with a one-time 24-hour set-up link. No way to remove staff from the screen. |
| **One kind of staff**                  | No roles yet: every staff member can do everything. Phase 1 adds Owner / Support / Read-only.                                                                |
| Accounts                               | List with search; account page with plan, trial, payments, users count, unit/lease counts, history of staff changes.                                         |
| Account actions                        | Extend trial, record a bank-transfer payment, change plan, suspend/reactivate, reopen a closed account. Each asks for a reason.                              |
| Other pages                            | Payments (with export for the bookkeeper), Demo requests, Partners and downloads, Website statistics, sign-up journey numbers.                               |
| What staff can't see                   | Tenant records. Staff see counts only. This matches the brief.                                                                                               |

### Logs

- **Customer audit log** (`AuditLog`): append-only, enforced by the database (it refuses updates and
  deletes; the only exception is deleting a closed account's own entries after 90 days).
- **Staff actions** are written to the same table with no account and `platform: true`. They are
  not yet a separate "staff log", and **viewing** pages is not logged, only changes. Phase 1
  creates a separate, append-only staff log that also records views and exports.

### Email (Brevo)

- Sent through Brevo's SMTP relay (port 2525 on the production server, because DigitalOcean
  blocks 587). One sender address for everything.
- **Transactional only today:** sign-up codes, password resets, invitations, the daily reminder
  email, trial and payment emails, demo/partner notifications to you. No marketing emails, no
  contact lists, no Brevo API use.
- Failed sends now give up after seconds and log the mail server's code only.

### Monitoring

- **Error tracking:** the code can report errors to Sentry, but only if `SENTRY_DSN` is set. It
  isn't set on either server, so today errors only go to the server's log.
- **Alerts built in:** a burst of failed staff sign-ins emails the platform admins; failed daily
  reminder emails show on the customer's Reminder emails page.
- **Health:** `/api/health` (database check) and the public `/status` page (database and daily
  reminders). The status page runs on the same server, so it goes down with the site.
- **No uptime monitor and no phone alerts** yet.

### Release pipeline

- **Tests:** GitHub Actions runs lint, type checks, unit, integration, build and browser tests on
  every pull request. It does **not** run on pushes to `claude/tender-mendel-owpm2c`, because the
  workflow only watches a `main` branch, which doesn't exist.
- **Deploying:** by hand, `sudo bash deploy/update.sh` on each server: backup, `git pull`, rebuild,
  restart. The test site (`139-59-104-149.sslip.io`) acts as an informal staging site.
- **No rollback button,** no branch protection, no automatic deploy. Rolling back today means
  `git checkout <older commit>` on the server and rebuilding.
- **Branch naming:** everything lives on `claude/tender-mendel-owpm2c`, which is the default
  branch. Phase 7 needs a proper `main` branch to protect (see risks).

### Things in the brief that differ from what exists

- **Payments use Xendit**, not PayMongo (decision §33). The Wave 2 billing agent would match
  **Xendit** payments.
- The customer role is called **"Admin"** in the code and screens (`ADMIN`, 107 places). Phase 1
  renames the label to **"User Admin"** everywhere people see it. I recommend keeping the internal
  code name `ADMIN` in the database, which avoids a risky data migration; only the words on screens,
  emails, help text and docs change.

---

## 2. Plan for Phases 1–9

Effort is in working days of development and testing, including tests and docs.

| Phase          | What                                                                                                                                                                                                                                                               | Effort           | Depends on       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------- |
| 1              | Console foundations: staff roles (Owner / Support / Read-only), add and remove staff on screen, separate append-only staff log (views, changes, exports), new console layout, Today page, Accounts search and filters; rename "Admin" → "User Admin"               | 5–6              | —                |
| 1b (suggested) | Monitoring tools only: connect Sentry, uptime checks, status page and phone alerts (chosen below). Half a day, and the site is live now.                                                                                                                           | 0.5              | Your tool choice |
| 2              | Support tools (with reason, logged twice), customer-granted support access (24 h / 72 h / 7 days, banner, revoke, auto-expiry), data-fix script template with dry run, break-glass runbook                                                                         | 4–5              | 1                |
| 3              | Pipeline (CRM): leads, stages, automatic stage moves, board / list / "follow up today", timeline, discovery notes, import, consent, Brevo contact sync and unsubscribes, deletion and retention                                                                    | 6–7              | 1                |
| 4              | Tickets: in-app Help form with screenshot, "My requests", email replies through Brevo, console ticket list and conversation                                                                                                                                        | 4                | 1                |
| 5              | Agent foundations: Agent API (keys, allowed actions, rate limits, logging), masking of personal details, approval inbox (+ daily reminder email), autonomy levels with locked tasks, instructions-as-files, evals command, Agents page with on/off, costs and caps | 7–8              | 1, 3, 4          |
| 6              | Support agent + public help centre with articles managed in the console                                                                                                                                                                                            | 5–6              | 4, 5             |
| 7              | Engineering agent on Claude Code GitHub Actions, release pipeline (staging → checks → production, one-click rollback), branch protection, outage handling, monthly restore report                                                                                  | 7–9              | 1b, 5            |
| 8              | Growth agent: pipeline upkeep, "talk to today" list, nurture emails, follow-up drafts, content calendar and drafts, weekly report                                                                                                                                  | 5–6              | 3, 5             |
| 9              | Monday digest                                                                                                                                                                                                                                                      | 1–2              | 5                |
| **Total**      |                                                                                                                                                                                                                                                                    | **≈ 45–55 days** |                  |

**Suggested order:** 1 → 1b → 2 → 4 → 3 → 5 → 6 → 9 → 8 → 7. Tickets (4) before the pipeline
(3) because the Support agent is the first agent to pay for itself. The digest (9) is small and
useful early. The engineering agent (7) last, because it needs the `main` branch, staging and
branch protection first, and Sentry already catches errors from 1b.

### Main risks

1. **Managed Agents is in beta.** Its interface can change. Mitigation: agents only talk to
   Propfolio through our own Agent API, so switching hosting later changes one layer, not the
   console.
2. **Personal data leaving the Philippines.** Agent requests are processed by Anthropic in the US
   (or "global"). There is no Philippine or Asian processing location. See §4 for what this means
   and how we limit it.
3. **Prompt injection** (customers writing "ignore your rules"). Mitigation: agents can't change
   accounts at all, every risky task is locked at Draft, masking, and eval cases for this.
4. **Brevo's free plan sends at most 300 emails a day, shared** between reminders, sign-up codes
   and marketing. Marketing could stop the daily reminders. Needs the paid plan before Phase 8
   (§6).
5. **The release pipeline needs a `main` branch.** Renaming the default branch is a one-time
   change: both servers then follow `main`. I'll give you the two commands when we get there.
6. **Staging costs a little.** Either keep the test site as staging (free, but it also hosts your
   testers), or a separate small server (about US$12 a month). Decide at Phase 7.
7. **Tagalog and Cebuano quality** is unproven: they stay at Draft for the first month, as the
   brief says.

---

## 3. Monthly cost estimate for each agent

**These are my assumptions. Please replace them with your expectations** (chat questions).

| Assumption (first 6 months)         | Value                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support tickets                     | 100 a month                                                                                                                                                                              |
| Sign-ups                            | 60 a month                                                                                                                                                                               |
| Leads in the pipeline               | 200                                                                                                                                                                                      |
| Bugs reaching the engineering agent | 5 a month, plus a weekly dependency check                                                                                                                                                |
| Model                               | Claude Opus 5.5 ($4 / $20 per million input / output tokens; cached input $0.20). Cheaper models (Sonnet 5.5: $2 / $10; Haiku 5.5: $0.10 / $0.50) can be tested against the evals later. |
| Managed Agents hosting fee          | $0.08 per hour a session runs (a few minutes each), on top of tokens                                                                                                                     |

| Agent             | How I estimated                                                                                                                | Per month (assumed volumes) | If volumes are 5× |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------- |
| Support agent     | ~3 model turns a ticket, ~20k tokens read (mostly cached help-centre text) and ~1k written each                                | **$15–30**                  | $75–150           |
| Growth agent      | One daily run (~100k read, ~10k written), nurture drafts per sign-up, weekly content drafts                                    | **$20–30**                  | $50–90            |
| Monday digest     | 4 runs                                                                                                                         | **$1–2**                    | $2–4              |
| Engineering agent | Claude Code runs: ~$2–6 per bug fix, ~$1 per weekly check; GitHub Actions minutes are within the free allowance at this volume | **$15–40**                  | $60–150           |
| **All agents**    |                                                                                                                                | **≈ $50–100**               | ≈ $190–400        |

Every agent gets a hard monthly spending cap; Managed Agents also enforces a per-session dollar
cap, so a runaway session stops itself.

---

## 4. Is Claude Managed Agents right for the Support agent, Growth agent and digest?

**Yes, with four conditions.** It fits because Anthropic runs the agent loop and stores each
agent's instructions as versioned objects, and scheduled runs (the daily growth run, the Monday
digest) are built in, so we don't host a scheduler for them.

### How session history is stored and deleted

- Each run is a **session**. Anthropic keeps a session's full history (messages, tool calls,
  results) **until we delete it**. There is no automatic expiry.
- **Deleting a session** permanently removes its history, its workspace and checkpoints.
  "Archiving" only makes it read-only; it does not delete.
- **Managed Agents is not eligible for Zero Data Retention.**
- Processing location can be pinned to the **US** or left "global". There is no Asia option.

### What that means under the Data Privacy Act

- Ticket text and lead details are personal data. Sending them to Anthropic is an outsourcing
  of processing **and** a cross-border transfer, so Propfolio stays accountable (RA 10173 §21):
  we need Anthropic's data processing terms on file, Anthropic listed as a sub-processor
  ("[LAWYER TO CONFIRM]"), and the minimum data sent.
- **Condition 1: delete on a schedule.** We add a daily job that deletes agent sessions older
  than the period you choose (suggestion: **30 days**). Our own console keeps what we need
  (approvals, drafts, actions) without the full session history.
- **Condition 2: mask before sending.** Names, ID numbers, phone numbers and emails that the agent
  doesn't need are replaced before ticket text reaches it (Phase 5).
- **Condition 3: no tenant records, ever.** The agents' only tools are our Agent API's narrow
  actions; no direct database access, no shell, no web browsing unless you approve it.
- **Condition 4: your lawyer reviews** the sub-processor entry and the cross-border wording.

### Fallback if it doesn't fit

The simplest fallback is **not** the Claude Agent SDK. The Agent SDK is built for coding agents
with files and a shell, which these agents shouldn't have. A better fallback is running each
agent inside our own worker with the standard Claude API (Messages API with tool use). The
agents would then keep history only in our own database, under our own retention rules, with no
hosting fee. It costs about 3–5 extra days (our own scheduler and conversation storage). The
engineering agent is different: it runs on **Claude Code GitHub Actions** either way.

**Recommendation:** start on Managed Agents as you chose. Because agents reach Propfolio only
through the Agent API, switching later is contained.

---

## 5. Tools you don't have yet

| Need                | Recommendation                                                                                                                                                    | Price                                                                                               | Why                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Error tracking      | **Sentry** (Developer plan)                                                                                                                                       | Free: 1 user, 5,000 errors a month. Team plan from **$26/month** (annual) when you add a developer. | Already wired into the code: set one setting. Works with Seer later.         |
| Uptime checks       | **Better Stack** (free tier)                                                                                                                                      | Free: 10 monitors, 1 status page, email/Slack alerts. Paid from about **$29/month**.                | Uptime and status page in one place, hosted away from your server.           |
| Status page         | **Better Stack status page** (included above)                                                                                                                     | Free on the free tier                                                                               | Stays up when your server is down; our `/status` page links to it.           |
| Urgent phone alerts | **Better Stack phone call + SMS** (paid responder seat) **or**, cheaper, **Pushover** (loud, repeating "emergency" push notifications until you acknowledge them) | Better Stack ~**$29/month** per person; Pushover **$5 one-time** per phone platform                 | Pushover is cheap and loud; Better Stack calls you, which is better at 3 AM. |

**My suggestion to start:** Sentry free + Better Stack free + Pushover ($5 once). Total about
**$5**. Move to Better Stack paid (phone calls) when you have paying customers who depend on the
reminders. Prices are from public pages on 25 Nov 2026; check them before you sign up.

**Sentry Seer** (automatic root-cause analysis that can hand fixes to a coding agent): Sentry
changed its pricing in January 2026 and current figures vary by source (around $40 per active
developer a month is quoted). I'll compare it properly at Phase 7, as the brief asks.

---

## 6. Brevo: marketing from a separate sender subdomain

1. **Keep account emails exactly as they are** on `propfolioph.com` (the authenticated domain):
   sign-up codes, reminders, invitations, payment emails.
2. **Add a second domain in Brevo:** `news.propfolioph.com`. Authenticate it the same way (Brevo
   gives the DKIM and verification records; add them in Namecheap, Host `news` instead of `@`).
   Add a DMARC record for it.
3. **Marketing sender:** e.g. `Propfolio <hello@news.propfolioph.com>`, with replies going to your
   normal inbox. If marketing ever gets spam complaints, the damage stays on `news.`, not on the
   domain that sends the daily reminders.
4. **Marketing goes through Brevo's campaign and contact features** (Phase 3 syncs contacts with
   consent and pulls unsubscribes back). Account emails keep using the SMTP relay.
5. **Move to the paid Starter plan (about $9/month for 5,000 emails) before Phase 8.** The free
   plan's 300-a-day limit is shared by everything, so a marketing send could block the daily
   reminder emails.
6. Optional later: a dedicated sending IP (Brevo's higher plans) only if volumes grow a lot.

---

## 7. Decisions needed (from the brief, with suggestions)

| #   | Decision                                                                          | Suggestion                                                         |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Monthly budget and per-agent caps                                                 | Support $40, Growth $40, Digest $5, Engineering $50 (≈ $135 total) |
| 2a  | How long to keep lost leads                                                       | 24 months, then delete                                             |
| 2b  | How long Anthropic keeps agent session history                                    | 30 days, then deleted by our daily job                             |
| 3   | On-call developer for outage alerts                                               | None for now; add later                                            |
| 4   | Tools                                                                             | Sentry free + Better Stack free + Pushover                         |
| 5   | When tasks leave Draft                                                            | Review after 4 weeks of approvals, per task                        |
| —   | Phase 1b (monitoring) inserted after Phase 1?                                     | Yes                                                                |
| —   | Keep the internal code name `ADMIN`, change only what people see to "User Admin"? | Yes                                                                |
| —   | Staging at Phase 7: reuse the test site, or a new ~$12/month server?              | Decide at Phase 7                                                  |
