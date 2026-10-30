# Propfolio QA findings — UAT site, 30 Oct 2026

Site: https://139-59-104-149.sslip.io · Account: "QA Robot" (Admin) · Full suite, desktop + phone

## The short version

**29 of 35 checks passed.** Roles and permissions held up: Viewers and Leasing Staff can't open,
download or call what they shouldn't, signing out really ends the session, and five wrong passwords
lock the account. Hostile input, impossible lease terms, bad payments, double-clicks and bad uploads
were all handled. **Every screen opens in under 1 second, including "New lease" (about 0.9 s).**

**One real problem matters now:** opening an uploaded document doesn't work. You get "This site
can't be reached". The known "unknown address shows an error instead of not found" problem
is confirmed on UAT. There's also one minor browser error on some report pages.

## Results per group (main run)

| Group     | Passed | Failed | Skipped | Failures                                                                   |
| --------- | -----: | -----: | ------: | -------------------------------------------------------------------------- |
| @smoke    |     13 |      0 |       0 | —                                                                          |
| @abuse    |      7 |      3 |       0 | 1 real (report pages browser error), 1 test-script mistake, 1 network blip |
| @roles    |      8 |      1 |       0 | Known: unknown addresses give an error page                                |
| @flow     |      1 |      1 |       0 | Real: opening a document fails                                             |
| @speed    |      0 |      1 |       0 | Test-script mistake (Guide panel left open); passed on re-run, all < 1 s   |
| **Total** | **29** |  **6** |   **0** |                                                                            |

Each failure was re-run once. The flow check was the exception: re-running it creates another
lease, so I checked its problem directly instead.

## Real app problems, most serious first

### 1. Opening a document doesn't work — Broken

- **What a user sees:** on a lease's Documents tab, clicking a document opens a browser page
  saying "This site can't be reached — 0.0.0.0 refused to connect". Uploading and removing
  documents work. Only opening one fails.
- **Steps:** open any lease → Documents → upload a PDF → click "Open <file name>".
- **Role:** anyone who can open documents (checked as Admin).
- **Evidence:** @flow check "create a lease … upload a document" fails at the open step. I
  checked by hand on the QA lease: the server sends the browser to `https://0.0.0.0:3000/…` (its
  internal address) instead of the site's real address. Screenshot shows Chrome's "This site
  can't be reached".
- **Cause (for the developers):** `src/app/api/v1/documents/[id]/link/route.ts` builds the link
  from `req.nextUrl.origin`, which behind the web proxy is the internal `0.0.0.0:3000`. It should
  use `APP_URL`. Queued as a separate task.

### 2. Unknown or malformed addresses show an error page instead of "not found" — Broken (known)

- **What a user sees:** a "Something went wrong" error page (HTTP 500) for a mistyped or
  out-of-date link.
- **Steps:** visit `/leases/not-a-real-id`, or `/leases`, `/tenants`, `/payments`, `/units`
  followed by any id that doesn't exist.
- **Role:** all (checked as Admin). No data is exposed: it's an error page, not someone
  else's record.
- **Evidence:** @roles "Guessing addresses (IDOR)" fails for all 7 addresses tried, the same on re-run.
  A friendly not-found page has since been pushed by the main development session but isn't on
  UAT yet. Re-check after the next deploy.

### 3. Browser error on some report pages — Cosmetic

- **What a user sees:** usually nothing. At most a brief flicker as the page redraws itself. It
  happens now and then on Collections and Expiry reports, mostly with unusual filters.
- **Steps:** open e.g. `/reports/expiry?days=-5` or `/reports/collections?days=999999` a few times.
- **Role:** Admin (others not checked).
- **Evidence:** @abuse "odd report filters" fails with "React error #418" (the page the server
  sent and the page the browser drew didn't match). It happened again on the re-run and on 5
  report pages in a separate probe, each time on different pages. Queued as a separate task.

## Test-script mistakes (not the app)

- **Password reset check typed too early.** The robot typed the email while the sign-in page was
  still showing. Already fixed on the main branch by the development session (it waits for the
  "Forgot password" page). Now passes: an unknown email and a real one get exactly the same
  "Check your email" message, so nobody can use it to find out who has an account.
- **Speed check blocked by the Guide.** The earlier Guide check pressed Esc and closed the tab
  before "Guide off" had finished saving. The Guide then stayed on for the QA account, and its
  panel covered the "Rent roll" card in the speed check. Fixed in this PR: the Guide check now
  waits for the save and confirms the Guide stays off after a refresh. The app itself saves "off"
  correctly.
- **"Back, Refresh and two tabs"** failed once with a dropped connection on refresh and passed on
  re-run: a network blip.

## Speed (@speed, from the re-run)

| Click                     |   Time |
| ------------------------- | -----: |
| Leases → New lease        | 0.90 s |
| Payments → Record payment | 0.83 s |
| Tenants → Add tenant      | 0.86 s |
| Menu → Leases             | 0.72 s |
| Menu → Calendar           | 0.84 s |
| Menu → Payments           | 0.66 s |
| Menu → Reports            | 0.90 s |
| Reports → Rent roll       | 0.87 s |
| Leases → open a lease     | 0.92 s |

Nothing over 2 seconds. A second run gave the same picture (all 0.74–0.98 s). The roughly
5-second "New lease" the founder saw did not happen from here. If it happens again, note the
time and whether it was the first click after a while. A slow first load after the server has
been idle is a common cause.

## Left behind / cleaned up

- **Cleaned up:** the half-finished @flow check left lease **LSE-2026-0029**, tenant **"QA Robot
  Tenant 202610301551"**, a voided ₱12,345.00 payment and a document "QA check.pdf". I removed
  the document and archived the lease and the tenant. I also archived a stray tenant **"QA Robot
  Bad Terms …"** left by the "impossible lease terms" check. No QA Robot rows remain in the
  Leases or Tenants lists.
- **Turned off, still listed:** six throwaway accounts ("QA Robot Leasing …" ×3,
  "QA Robot Viewer …" ×3) under Settings → Users, all **Turned off**. Each run adds two more.
- **Still there, on purpose:** the building "QA Robot (automated checks)" with unit QA-1, which the
  checks reuse.
- **Guide setting:** off on the QA Robot account (checked at the end).
- **One password-reset email** went to `admin@propfolio.test` during the earlier by-hand check.
  It expired after 60 minutes.
- **Worth a later fix in the robot:** if the @flow check fails partway it doesn't clean up after
  itself, as happened this time.

## Running notes

The browser installed in the cloud environment doesn't match this project's Playwright version.
Add `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` when running there (already in `qa/README.md`).
