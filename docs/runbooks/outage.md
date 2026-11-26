# Outage runbook: Propfolio is down or broken

Your phone gets an **urgent** Pushover alert (it repeats until you tap it). A second person gets
it too if you set `PUSHOVER_SECOND_USER_KEY`.

**Restarting is always safe. Never delete anything. Never restore a backup to fix an outage
unless data is actually wrong (that's `docs/restore.md`).**

## 1. Look

1. Open the console → **System health**. Each open incident shows **Suggested next step** and
   what Propfolio checked (database, background jobs).
2. If the console doesn't open at all, go to step 2b.

## 2. Try the safe fix

a. **The console opens:** under **Safe fixes**, click the button the suggestion names
(**Restart the web app** or **Restart background jobs**), say why, confirm. The server does
it within a minute and the list shows **Done**.

b. **Nothing opens:** the server's watchdog already restarts the web app after 3 failed checks
(about 3 minutes). Wait 5 minutes. Still down? Open the server console (DigitalOcean →
droplet → **Console**) and run:

```bash
cd /opt/propfolio/deploy && sudo docker compose restart web worker
```

c. **It broke right after a release:** **GitHub → Actions → Rollback → Run workflow.**

## 3. Database not answering

The suggestion says "Don't restart anything yet". In the server console:

```bash
cd /opt/propfolio/deploy && sudo docker compose ps && df -h /
```

- `postgres` not "running (healthy)": `sudo docker compose up -d postgres`, wait a minute.
- The disk (`/`) is 100% full: `sudo docker image prune -af`, then `sudo docker compose up -d`.
- Neither: ask a developer. Don't restore a backup.

## 4. Several things failed at once

Probably the server itself (DigitalOcean issue, out of memory). Check
https://status.digitalocean.com. In the droplet's **Graphs**, look at memory and disk. If the
droplet is off, **Power → Turn on**. Then step 2b.

## 5. Tell customers

When an urgent incident opens, a **status-page message** waits in the console → **Approvals**.
Read it, edit if you like, **Approve**: it shows on propfolioph.com/status. When it's fixed, a
"Fixed" message waits there too. Nothing goes public without your approval.

## 6. Afterwards

1. On System health, **Mark resolved** with a short note of what you did.
2. Error alerts open a GitHub issue; the Engineering agent proposes a fix as a pull request.
   Review it as usual (`docs/ops-console/engineering-setup.md`).
