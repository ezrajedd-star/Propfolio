# Break-glass runbook

_Only for an emergency that the console, the support tools and a reviewed data fix can't handle
fast enough: customer data at risk, the site down for everyone, or a security breach. Using it
always ends with an after-note (template below)._

## Before you start

1. **Is it really an emergency?** If it can wait a few hours, write a data fix instead
   (`scripts/data-fixes/README.md`).
2. **Tell someone.** Message your second contact (or write in the incident on System health)
   that you are using break-glass, and why.
3. **Note the time.** Everything you do from now goes in the after-note.

## Getting in

1. In DigitalOcean, open the **real** server → **Console**.
2. Take a backup first, unless the server can't: `sudo bash /opt/propfolio/deploy/backup.sh`
3. Look before you change anything:

   ```bash
   cd /opt/propfolio/deploy
   docker compose ps
   docker compose logs --tail 100 web
   docker compose logs --tail 100 worker
   ```

## Safe actions (try these first)

| Problem                          | Do this                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The site doesn't answer          | `docker compose restart web`                                                                                                           |
| Reminder emails or renewals stop | `docker compose restart worker`                                                                                                        |
| Everything is stuck              | `docker compose up -d` (starts anything that stopped)                                                                                  |
| A bad update                     | `git -C /opt/propfolio log --oneline -5`, then `git -C /opt/propfolio checkout <previous>` and `docker compose up -d --build`          |
| The disk is full                 | `docker image prune -f` and `df -h`                                                                                                    |
| A staff account is compromised   | Console → Staff → Turn off. If you can't sign in: `docker compose run --rm platform-admin --email <yours>` gives you a new set-up link |
| A customer user is compromised   | Console → the account → People → Reset two-step (their sessions end)                                                                   |

## Last resort: the database itself

Only if the above can't work and data is being damaged right now.

```bash
cd /opt/propfolio/deploy
docker compose exec postgres psql -U propfolio -d propfolio
```

- Read first (`SELECT`). Change one thing at a time, inside `BEGIN; … COMMIT;`, so you can
  `ROLLBACK;` a mistake.
- Never touch `AuditLog` or `StaffLog` (the database refuses anyway).
- Never edit posted payments or charges; stop the damage, then fix them in the app.
- Never copy customer data off the server.

To restore a backup instead: `docs/restore.md`.

## Afterwards (the same day)

1. Mark the incident resolved on System health, with a one-line note.
2. Write the after-note below and keep it in `docs/runbooks/after-notes/<yyyy-mm-dd>.md` (a pull
   request), without customer names or personal data.
3. If customer data was exposed, follow the privacy breach steps: the National Privacy
   Commission must be told within 72 hours if personal data was likely seen by someone it
   shouldn't have been [LAWYER TO CONFIRM].

---

## After-note template

```markdown
# After-note: <one line>, <date>

- **Who:** <your name> (second contact told: <name, time>)
- **When:** started <time>, finished <time> (Manila)
- **What happened:** <plain words; no customer names or personal data>
- **Who was affected:** <how many accounts; which parts of the app>
- **What I did, in order:**
  1. <time> — <command or action>
  2. …
- **Backup taken first:** yes / no (why not)
- **Data changed by hand:** none / <what, in which table, how many rows>
- **Customer data exposed:** no / yes → privacy steps started at <time>
- **Why it happened:** <the cause, if known>
- **So it doesn't happen again:** <GitHub issue numbers>
```
