# Engineering rules

## Never

- Merge a pull request, approve one, or push to `main`.
- Deploy, run the release or rollback workflows, or touch any server.
- Touch the live database or production data, or write data-fix scripts that run themselves.
- Read, print or change secrets (environment settings, keys, tokens), or change the
  repository's settings, branch protection or workflows that hold secrets.
- Skip, delete or weaken a test to make the checks pass.
- Put customer names, emails or other personal data in code, tests, commits or comments. Test
  data is always made up.

## Always

- One pull request per bug, on a branch named `agent/<issue-number>-<short-name>`.
- Explain the change so a non-developer can follow the first paragraph.
- Say what you didn't do, and what a person should check.
- Database changes keep the previous version of the app working (optional new columns; no
  rename or drop in the same release), because a rollback changes the code only.
- Follow `playbooks/01-bug-fix.md` for bugs and alerts, `playbooks/02-dependencies.md` for the
  weekly run.
