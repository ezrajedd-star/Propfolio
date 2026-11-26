# Connecting the sales pipeline to Brevo

_For the founder. About 30 minutes. Never paste keys into a chat._

The console's **Pipeline** works without Brevo. Connecting Brevo puts the leads who **agreed to
marketing** on one Brevo list, and brings unsubscribes back automatically. Nobody without
consent is ever sent to Brevo.

## Step 1: A separate address for marketing emails (15 minutes, then up to a day's wait)

Marketing emails go from **news.propfolioph.com**, so a complaint about a newsletter never
affects the sign-in codes and reminders sent from propfolioph.com.

1. In Brevo: **Settings → Senders, Domains & Dedicated IPs → Domains → Add a domain** →
   `news.propfolioph.com`.
2. Add the records Brevo shows in Namecheap **Advanced DNS** (as for the main domain: type the
   Host without `.propfolioph.com`, e.g. `mail._domainkey.news`).
3. **Senders → Add a sender**: `Propfolio <hello@news.propfolioph.com>`. Use this sender for
   every marketing campaign.

## Step 2: The marketing list and an API key (5 minutes)

1. **Contacts → Lists → Create a list** called `Propfolio marketing`. Note its **ID** (the
   number shown next to it).
2. **Settings → SMTP & API → API keys → Generate a new API key** called `Propfolio pipeline`.
   Copy it.
3. If you're on Brevo's free plan, consider Starter (about US$9/month): the free plan's 300
   emails a day are shared with sign-in codes and reminders.

## Step 3: Put them on the server (5 minutes)

```bash
sudo nano /opt/propfolio/deploy/.env
```

Add, then **Ctrl+O**, Enter, **Ctrl+X**:

```
BREVO_API_KEY='…'
BREVO_MARKETING_LIST_ID=…
```

Restart: `cd /opt/propfolio/deploy && docker compose up -d`

## Step 4: Unsubscribes back to Propfolio (5 minutes)

1. `sudo bash /opt/propfolio/deploy/monitoring-links.sh` and copy the **Brevo marketing
   webhook** link.
2. In Brevo: **Contacts → Settings → Webhooks → Add a webhook**: paste the link, tick
   **Unsubscribed** and **Marked as spam**. Save.

A daily check also pulls unsubscribes from Brevo, in case a webhook is missed.

## Rules the console keeps for you

- No marketing without consent (yes, the date, and where they agreed).
- Bought lists must never be imported.
- Lost leads are deleted automatically 24 months after they were lost.
- "Delete (privacy request)" on a lead deletes it here and in Brevo.
