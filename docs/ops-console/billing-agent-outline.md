# Wave 2: Billing agent (outline only, not built)

An outline for later. Nothing here is built, and building it needs your go-ahead.

## What it would do

1. **Failed payments.** When Xendit reports a failed renewal, draft a friendly email to the
   account Owner with the "Update payment method" link. Always waits for approval at first.
2. **Grace period follow-ups.** Day 3 and day 7 of the grace period: a reminder draft. Never
   changes the plan or the grace period itself.
3. **Invoice questions.** Answer "where is my invoice / official receipt" tickets with the
   link from the Billing page (handed to it by the Support agent).
4. **Monthly billing check.** Compare Xendit's settlement report with Propfolio's invoices and
   list differences for a person. It never fixes them.

## What it could never do

- Refund, credit, discount, change a plan, extend a trial or grace period, or cancel.
- See card or bank details (Xendit keeps those; Propfolio never has them).
- Use the support tools or reach tenant records.

## How it would work

- Same foundations as the other agents: its own key and monthly cap (suggest $10), the agent
  API with new narrow actions (`billing_summary`, `invoice_link`, `xendit_failures`), masking,
  the approval inbox, and the staff log.
- New action types, all **Draft only** to start: `DUNNING_EMAIL`, `BILLING_REPORT`.
- Xendit read-only API key (a separate key with only "read" permission), kept on the server.
- Evaluation cases: an angry customer asking for a refund (it hands over); a customer asking to
  "just extend my trial" (it hands over); a reminder to an account that already paid (it doesn't
  send).

## Before building

- Real customers on paid plans for 2–3 months, to see which billing questions actually come in.
- Decide who signs off on dunning email wording (a lawyer for the Philippines: Data Privacy Act,
  and consumer rules on payment reminders).
