# Setting up monitoring and phone alerts

_For the founder. About 45 minutes. All three tools have free plans (Pushover is a one-off
US$5 per phone type after a 30-day trial)._

When something breaks, you get a push on your phone and the problem shows in the console under
**System health**. Never paste keys or links from these steps into a chat; they're secrets.

---

## Step 1: Get the alert links from the server (2 minutes)

In the DigitalOcean console of the **real** server:

```bash
sudo bash /opt/propfolio/deploy/update.sh
sudo bash /opt/propfolio/deploy/monitoring-links.sh
```

It prints three links. Keep the window open; you'll copy them in steps 2 and 3.

## Step 2: Better Stack, to check the site from outside (15 minutes)

1. Sign up (free) at **betterstack.com → Uptime**.
2. **Monitors → Create monitor**: type **"URL becomes unavailable"**, paste the **Uptime check
   URL** (ends with `/api/health?deep=1`), check every **3 minutes**. Save.
3. **Integrations → Webhook → Add**: paste the **Better Stack webhook** link. Tick incidents
   **started** and **resolved**. Save.
4. On your phone, install the **Better Stack** app and sign in. This matters: if the whole
   server is down, Propfolio can't send you anything, so Better Stack's own app tells you.

## Step 3: Sentry, for errors (15 minutes)

1. Sign up (free) at **sentry.io**, create a project of type **Node.js**, called `propfolio`.
2. Copy the **DSN** it shows (starts with `https://` and ends with a number).
3. **Settings → Integrations → WebHooks → Add to project**: paste the **Sentry webhook** link.
4. **Alerts → Create alert → Issues**: "A new issue is created" → action "Send a notification
   via WebHooks". Save.

## Step 4: Pushover, for alerts on your phone (10 minutes)

1. Install **Pushover** on your phone and create an account. Your **user key** is on the
   app's home screen (and at pushover.net).
2. At **pushover.net → Create an Application**: name it `Propfolio`. Copy its **API token**.
3. Optional second contact: they install Pushover too and send you their user key.

## Step 5: Put the keys on the server (5 minutes)

```bash
sudo nano /opt/propfolio/deploy/.env
```

Add these lines with your own values (leave the second key out if you have no second contact),
then **Ctrl+O**, Enter, **Ctrl+X**:

```
SENTRY_DSN='https://…'
PUSHOVER_APP_TOKEN='…'
PUSHOVER_USER_KEY='…'
PUSHOVER_SECOND_USER_KEY='…'
```

Restart: `cd /opt/propfolio/deploy && docker compose up -d`

## Step 6: Check it works (2 minutes)

1. In the console, open **System health**. Every check should be green.
2. Click **Send a test alert**. Your phone should buzz within a minute.

## What the alerts mean

| Alert                       | What happened                                    | What to do                                                              |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| **Propfolio: urgent**       | The site (or background jobs) stopped answering. | Open System health. If it doesn't clear in 10 minutes, see the runbook. |
| **Propfolio: needs a look** | A new kind of error happened.                    | Look today. Open the link to Sentry from System health.                 |
| **Resolved**                | The uptime check is green again.                 | Nothing. Add a note in System health if you did something.              |
