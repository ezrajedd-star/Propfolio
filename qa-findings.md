# Propfolio test site: automated check results

**Site checked:** the test version at https://139-59-104-149.sslip.io
**Date:** 3 Nov 2026 (4 Nov in Manila)
**Who ran it:** the "QA Robot" account, running the automated check list in `qa/`

## Update, 4 Nov 2026: all issues fixed

| Issue | Status |
| --- | --- |
| 1. Uploaded documents can't be opened | **Fixed in the code.** The "open" link now uses the site's public address. A new automatic check fails on the old code and passes on the new. **The test site will only behave correctly once this version is deployed there.** |
| Leftover test lease LSE-2026-0033 | **Archived** on the test site, along with its test tenant. Home no longer counts it. |
| End-to-end check could leave a test lease behind | **Fixed.** It now archives its test lease and tenant even when a step fails. |
| 2. Robot's role checks stuck on the welcome tour | **Fixed.** Confirmed: all 9 role checks pass against the test site. |

After deploying, run the checks again to confirm that opening a document works on the live test site.

## In one sentence

Almost everything works and the security basics are solid, but **opening an uploaded document is broken**. Fix that before real users rely on documents.

## Scorecard

| Area | Result |
| --- | --- |
| Site safety basics (secure connection, signed-out visitors blocked, cookies, protection against other websites) | ✅ All passed |
| Every screen, report and settings page opens | ✅ All passed |
| Excel downloads, the Guide, phone layout | ✅ All passed |
| Each role sees only what it should (Viewer, Leasing Staff) | ✅ All passed (see note 2) |
| Trying to break it (hostile text, impossible lease terms, bad payment amounts, double-clicks, odd uploads, Back/Refresh) | ✅ All passed |
| Speed (time from a click to the next screen) | ✅ Passed |
| A whole lease from start to finish | ❌ **Failed at "open the document"** |

The first full run: 26 checks passed and 9 failed. One failure is a real problem in the app. The other 8 came from a mistake in the robot's own script, and they all passed once that was worked around.

## What's broken

### 1. Uploaded documents can't be opened. Serious.

- **What a person sees:** they upload a contract on a lease's Documents tab and see "Document uploaded ✓". When they click to open it, the browser shows **"This site can't be reached"** instead of the file.
- **Why:** when the app sends the browser to the file, it uses the server's internal address (`0.0.0.0:3000`) instead of the site's public address. The upload worked; only the link to open it is wrong.
- **How serious:** high for anyone who keeps signed contracts and IDs in Propfolio, because none of them can be viewed. No data is lost or exposed: the files are stored safely and are just unreachable.
- **For the developer:** `src/app/api/v1/documents/[id]/link/route.ts` builds the redirect from `req.nextUrl.origin`, which behind the Caddy proxy is the internal address. The app's public address should be used instead. This was confirmed in the code. I didn't re-run the end-to-end check, because each run leaves another test lease behind and the cause is certain.

### Side effect: leftover test data on the test site

Because the end-to-end check stopped at the document step, it never reached its clean-up step. The test site still has:

- an **active lease LSE-2026-0033** for "QA Robot Tenant 202611031601" in unit QA-1 of the "QA Robot (automated checks)" building, with one uploaded test PDF. Because of it, Home shows that building as "100% occupied".

It's clearly labelled "QA Robot", and the robot archives leftover QA leases on its next run. Testers can also archive it by hand. Don't use it when comparing totals.

## Notes (not app problems)

### 2. The robot's role checks need a one-line fix

All 8 role checks failed on the first run and failed again on the one retry. The cause is the robot, not the app: after signing in as a new test user, it closes the welcome tour automatically, then tries to click the tour's "Skip tour" button a second time and waits for it until it gives up.

I worked around that one line in a temporary copy of the checks; nothing in the project was changed. All 9 role checks then **passed**:

- A Viewer sees only Home, Calendar and Units.
- A Viewer is refused every leasing and admin page, and every download or data feed with money or contact details.
- What a Viewer can see contains no money, contact or lease details.
- Leasing Staff can't reach Settings or admin pages, but their daily work pages open.
- Guessed or made-up record addresses show "not found", never an error.
- Signing out really ends the session.
- Five wrong passwords lock the account with a clear message.

**Suggested fix for the developer:** in `qa/tests/helpers.ts`, `signInWith`, the final `skip.click()` should be dropped or allowed to fail quietly, as it was in the temporary copy.

### 3. Test accounts

Each role run makes two throwaway "QA Robot" users (one Viewer, one Leasing Staff) and turns them off at the end. Three runs happened (full run, retry, fixed run), so there are up to six turned-off QA Robot users in Settings → Users. That is expected.

## What to do next

1. **Fix the document-opening link** (item 1), then run the checks again to confirm the whole lease flow passes and cleans up after itself.
2. Fix the robot's tour click (item 2) so future runs report role checks correctly.
3. Optionally archive the leftover QA lease LSE-2026-0033 now.
