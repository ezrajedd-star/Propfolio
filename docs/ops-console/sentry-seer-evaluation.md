# Sentry Seer: evaluation (decision needed)

**Recommendation: don't buy Seer now.** Look again after 8 December 2026, when Sentry
publishes its new prices.

## What Seer is

Sentry's AI debugger. For an error, it finds the likely cause ("root cause analysis") and can
propose a fix as a pull request ("Autofix").

## Price

- Today: **$40 per active contributor per month** (everyone who commits to the repository,
  except bots). For Propfolio that's about $40 a month.
- From **8 December 2026** Sentry moves Seer to **usage-based credits**. The credit prices
  aren't published yet, so the real cost is unknown.
- Seer's code review feature is being removed on the same date.

## Compared with what we built

|                                                      | Seer                                        | Engineering agent (built)                                             |
| ---------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Finds the cause of an error                          | Yes, with the full stack trace and the code | Yes, from the Sentry link and the code                                |
| Proposes a fix                                       | Pull request                                | Pull request with a failing test first, plain explanation, risk level |
| Runs the tests before proposing                      | No (CI runs after)                          | Yes, all checks                                                       |
| Also handles bug reports and weekly security updates | No                                          | Yes                                                                   |
| Cost                                                 | ~$40/month now; unknown after 8 Dec 2026    | Uses the Engineering budget ($50 cap), pay per run                    |
| Can merge or deploy                                  | No                                          | No                                                                    |

## Why not now

1. The Engineering agent already does the same job, plus bugs from customers and security
   updates, inside the $50 cap.
2. The price changes in two weeks to something not yet published.
3. With few errors a month, a flat fee costs more than per-run use.

## When to look again

- After 8 December 2026, once the credit prices are public.
- If the Engineering agent often can't find the cause of an error (you'll see "couldn't find the
  cause" comments on alert issues). Seer sees more of Sentry's data (traces, breadcrumbs).

Sources: [Sentry pricing docs](https://docs.sentry.io/pricing), [Seer](https://sentry.io/seer/),
[Suggested fix docs](https://docs.sentry.io/product/issues/issue-details/suggested-fix/),
[Seer budget](https://docs.sentry.io/pricing/quotas/manage-seer-budget) (checked 26 Nov 2026).
