# Launch readiness checklist

_Public launch, Phase 8. Last updated 8 Nov 2026. ✅ done · ⚠️ partly done · ❌ not done yet._

## The brief's checklist

| #   | Item                                                                               | Status | Where it stands                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Every phase complete, with tests passing                                           | ⚠️     | Launch phases 0–8 are built and every automated test passes (unit, integration, browser, phone). Two gaps: the **PayMongo adapter** (PayMongo isn't accepting merchants yet; a demo checkout stands in) and the original build's **Phase 7 "Polish"** (accessibility review, empty states), which was never formally run. |
| 2   | A backup restore tested                                                            | ✅     | Restored end to end on 3 Nov 2026 (`docs/restore.md`). Repeat quarterly, and once more on the production server.                                                                                                                                                                                                          |
| 3   | Monitoring alerts working                                                          | ⚠️     | Built: error tracking (Sentry, needs `SENTRY_DSN`), failed sign-in burst alerts to platform admins, and reminder-email failures shown to Admins. Not yet proven on the server: set `SENTRY_DSN`, trigger a test error and a test sign-in burst, and confirm both alerts arrive.                                           |
| 4   | The penetration-test findings fixed (after the outside test)                       | ❌     | The outside test hasn't happened. Book it once PayMongo is connected (so it covers payments too). `docs/security-summary.md` is ready to hand to the testers.                                                                                                                                                             |
| 5   | PayMongo live keys switched in                                                     | ❌     | Blocked: PayMongo isn't accepting new merchants. When it is: write the adapter (steps in decisions §28), test with test keys, then switch to live keys.                                                                                                                                                                   |
| 6   | One real ₱1,500 payment made and refunded                                          | ❌     | Needs item 5.                                                                                                                                                                                                                                                                                                             |
| 7   | A full walk-through on a phone: sign up, import, trial, upgrade, downgrade, cancel | ⚠️     | Automated on a simulated Pixel 7 (`e2e/launch-walkthrough.responsive.spec.ts`), passing, with no page scrolling sideways. Still to do: the same on your own phone, on the real site, with real payments (after item 5).                                                                                                   |

## Also needed before real customers' data

| Item                                                                                                                      | Status | Who                      |
| ------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------ |
| Lawyer's text for the Terms, Privacy Policy, DPA and refund terms (pages exist, marked "[LAWYER TO SUPPLY]")              | ❌     | Lawyer                   |
| Business details: registered name, DTI/SEC and TIN, address, phone, data-hosting location (`src/domain/legal/company.ts`) | ❌     | You (then the developer) |
| `SUPPORT_EMAIL` set on the server (Contact page, "Email us" buttons)                                                      | ❌     | You                      |
| BIR invoicing method (payment records say "not an official invoice" until then)                                           | ❌     | Accountant               |
| How long to keep data after an account closes (brief decision 3; suggestion: 90 days with an export reminder)             | ❌     | You                      |
| A separate production server with its own secrets (the current server is the test site)                                   | ❌     | Developer                |
| Database and documents on encrypted storage (DigitalOcean Volume or Managed Database, about US$1–15 a month)              | ❌     | Developer                |
| Google sign-in and the Cloudflare bot check turned on (keys in the server settings)                                       | ❌     | You (keys), developer    |
| Virus scanning of uploads on (needs a 4 GB server)                                                                        | ❌     | You (cost decision)      |
| Remaining dependency upgrades: PRs #10, #12, #13 need code changes                                                        | ❌     | Developer                |
| The first customer's account within its plan's user limit (5 on Premium), or a decision to give it more                   | ⚠️     | You                      |
| Two-step sign-in, rate limits, backups, account separation, audit log, plan limits, sign-up, billing logic, teams         | ✅     | —                        |
| Public pages the payment partner checks (pricing, terms, privacy, DPA, refunds, contact), linked from the sign-in page    | ✅     | —                        |

## How to update this list

Change a row's status when it is done, with the date and a word on how it was checked. The
automated tests behind the ✅ rows run on every change (`pnpm test`, `pnpm test:integration`,
`pnpm test:e2e`).
