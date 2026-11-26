# Reviewed data fixes

Sometimes data needs correcting in a way the app can't do (a bad import, a bug's leftovers).
We never edit the live database by hand and there is no database editor in the console. Instead:

1. **Write it.** Copy `TEMPLATE.ts` to `<yyyy-mm-dd>-<ticket>-<short-name>.ts`. Fill in **what**,
   **why** and the **ticket**. Change as little as possible; narrow every query by account id
   and record id. Return counts only. Posted financial records are never edited: void or reverse
   them in the app instead.
2. **Review it.** Open a pull request. Another person (or the founder) reads it. CI runs every
   fix as a dry run against an empty database, so it at least runs.
3. **Dry run on the test server (staging)** with a copy of the data:
   `sudo bash /opt/propfolio/deploy/data-fix.sh scripts/data-fixes/<file>.ts`
   It prints what it would change and changes nothing.
4. **Approve.** The approver writes "approved" on the pull request and merges it.
5. **Apply on the real server**, which takes a backup first:
   `sudo bash /opt/propfolio/deploy/data-fix.sh scripts/data-fixes/<file>.ts --apply --approved-by "Name"`
6. **Results are logged** in the staff log (what, why, ticket, who approved, the counts). Add
   them to the ticket.

If a fix fails, nothing is changed (it runs in one transaction).
