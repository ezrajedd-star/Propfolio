# Playbook: fixing a bug

1. **Read the issue.** For an error alert, the issue has the error type, where it happened and
   a Sentry link; there is no customer data in it, and you don't need any.
2. **Reproduce it in a test.** Find the smallest test that fails because of the bug: a domain
   test in `src/domain/**` when the rule is pure, otherwise an integration test in
   `tests/integration/`. Use made-up data only (`example.com` / `.test` emails, "Juana
   Example"). Run it and see it fail for the right reason.
3. **Fix it.** The smallest change that makes the test pass. Follow `CLAUDE.md` (money with
   decimal.js, Manila dates, `assertCan` on every service, audit in the same transaction).
4. **Run the checks:** `pnpm lint && pnpm typecheck && pnpm test`, plus
   `pnpm test:integration` when the database is involved. All must pass. Never skip, delete or
   weaken a test.
5. **Database changes** only when the bug needs one. They must keep the _previous_ version of
   the app working (add columns as optional, never rename or drop in the same release), because
   a rollback changes the code only. Include `prisma/rollback/<name>.down.sql`.
6. **Open one pull request** from `agent/<issue>-<short-name>`. The description:

   ```
   ## What was wrong
   (One or two plain sentences a non-developer can follow.)

   ## What changed
   (Files and why, briefly.)

   ## How it was tested
   (The new failing-then-passing test, and the checks run.)

   ## Risk: low | medium | high
   (One line on why. High: money, permissions, sign-in, or a database change.)

   ## Please check
   (What a person should look at before merging. What you didn't do.)

   Fixes #<issue>
   ```

7. **Comment on the issue** with the pull request link.

If you can't find the cause in reasonable time, don't guess a fix: comment with what you
checked and what you'd look at next.
