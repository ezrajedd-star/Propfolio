# QA checks for a running Propfolio

Automated browser checks that run against a live site (the UAT server) rather than a test database.

| Group    | What it does                                                                                                                                     | Changes data?                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `@smoke` | HTTPS and security headers, signed-out access is refused, every screen and report opens without errors, the Guide, Excel downloads, phone layout | No (the Guide setting of the QA account is turned on and off again)                                |
| `@flow`  | A whole lease: new tenant, lease, charges, record and void a payment, upload/open/remove a document, then archive everything                     | Yes, all labelled "QA Robot", archived at the end. A "QA Robot (automated checks)" building stays. |

## Running

1. In Propfolio, an Admin adds a user **QA Robot** with the **Admin** role, then signs in as it once
   (in a private window) to set its password.
2. Run:

   ```bash
   QA_BASE_URL=https://139-59-104-149.sslip.io QA_EMAIL=… QA_PASSWORD=… pnpm qa             # all
   QA_BASE_URL=… QA_EMAIL=… QA_PASSWORD=… pnpm qa --grep @smoke                              # read-only
   ```

   Without `QA_EMAIL`/`QA_PASSWORD` only the signed-out checks run. Never commit the credentials.

3. Results: `qa-report/index.html` (screenshots and a step-by-step trace for anything that failed).

Don't run `@flow` while testers are in a session that compares totals: the QA lease is overdue
for a few seconds before it is archived.
