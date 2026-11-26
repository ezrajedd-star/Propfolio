# Set up releases and one-click rollback

After this, merging a pull request into `main` releases it:

**merge → all checks → staging (when you have one) → you click "Approve" → production → check**

If the new version doesn't work on the server, the server goes back to the previous version
by itself. You can also go back with one click.

Do `engineering-setup.md` steps 1–2 first. About 30 minutes, once.

## 1. Let GitHub deploy to the server

1. Open the server console (DigitalOcean → your droplet → **Console**).
2. Run:
   ```bash
   cd /opt/propfolio && sudo git pull && sudo bash deploy/release-setup.sh
   ```
3. It prints a **private key** and two values. Keep the window open for step 2.

The key can only run "deploy", "rollback" and "status". Nothing else on the server.

## 2. Tell GitHub about the server

1. GitHub → **Settings → Environments → New environment**, name `production`, **Configure**.
2. Tick **Required reviewers**, add yourself, **Save protection rules**. (This is the one-click
   approval before anything reaches customers.)
3. **Environment secrets → Add secret**: `DEPLOY_SSH_KEY` = the private key from step 1.
4. **Environment variables → Add variable**, three times:
   - `DEPLOY_HOST` = the address printed in step 1
   - `DEPLOY_KNOWN_HOSTS` = the line printed in step 1
   - `APP_URL` = `https://propfolioph.com`

## 3. Release

1. Merge a pull request into `main`.
2. **Actions → Release**: the checks run (about 15 minutes), then GitHub emails you
   "Review pending deployments". Click **Review deployments → production → Approve and deploy**.
3. About 10 minutes later it shows ✔. If the check fails, the server has already gone back to
   the previous version; you'll see ✘ and the reason.

## 4. Roll back (one click)

1. **Actions → Rollback → Run workflow**. Leave "Version" empty. Click **Run workflow**.
2. It goes back to the version released before the current one. Your data is kept.

## Staging (later)

A staging server is a second, small copy of Propfolio with made-up data, where each release runs
first. **Recommended once you have paying customers** (about $12 a month: a 2 GB DigitalOcean
droplet).

1. Create the droplet and run `sudo bash deploy/setup.sh` on it (the test site, `docs/deploy-uat.md`).
2. Do step 1 above on it, and step 2 with an environment named `staging` (no required reviewer;
   `APP_URL` = its address).
3. **Settings → Secrets and variables → Actions → Variables → New repository variable:**
   `STAGING_ENABLED` = `true`.

Until then, releases go straight from the checks to your approval for production.
