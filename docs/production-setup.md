# Setting up the real Propfolio at propfolioph.com

_For the founder. About 1½ hours, most of it waiting. Last updated 18 Nov 2026._

The test site (`139-59-104-149.sslip.io`) stays as it is, for trying things out. The real site is a
**second, separate server** with its own passwords and keys and no demo data. Customers' data
lives only there.

You'll need: your DigitalOcean, Namecheap, GitHub and Brevo logins, and (for payments) your Xendit
account.

---

## Step 1: Create the server on DigitalOcean (10 minutes)

1. In DigitalOcean: **Create → Droplets**.
   - **Region:** Singapore (SGP1)
   - **Image:** Ubuntu **24.04 (LTS) x64**
   - **Size:** Basic → Regular → **2 GB RAM / 1 CPU** (about US$12 a month)
   - **Authentication:** a long password, saved in your password manager.
   - **Backups:** weekly backups are optional (about US$2.40 a month more). The off-site backups in
     Step 6 cover the data either way.
   - **Hostname:** `propfolio-production`
2. Click **Create Droplet**. Note its **IP address**, e.g. `203.0.113.40`.

## Step 2: Point propfolioph.com at the server (5 minutes, then up to 30 minutes' wait)

1. In Namecheap: **Domain List → propfolioph.com → Manage → Advanced DNS**.
2. **Delete** the records Namecheap added by default (a `CNAME` for `www` pointing to
   `parkingpage.namecheap.com`, and a `URL Redirect` record for `@`, if you see them).
3. **Add New Record** twice:

   | Type     | Host  | Value                    | TTL       |
   | -------- | ----- | ------------------------ | --------- |
   | A Record | `@`   | the droplet's IP address | Automatic |
   | A Record | `www` | the droplet's IP address | Automatic |

4. Click the green tick to save each one. It usually takes 5–30 minutes to work. To check, visit
   <https://dnschecker.org/#A/propfolioph.com>: when most places show your droplet's IP, go on.

## Step 3: Let the server download Propfolio (5 minutes)

Same as for the test server, with its own key:

1. In DigitalOcean, open the new droplet → **Console**.
2. Paste, then press Enter:

   ```bash
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C propfolio-production && cat ~/.ssh/id_ed25519.pub
   ```

   Copy the line it prints (starts with `ssh-ed25519`).

3. On GitHub: **ezrajedd-star/propfolio → Settings → Deploy keys → Add deploy key**. Title
   `propfolio-production server`, paste the line, leave **Allow write access** unticked, **Add key**.
4. Back in the console:

   ```bash
   ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
   git clone --branch claude/tender-mendel-owpm2c git@github.com:ezrajedd-star/propfolio.git /opt/propfolio
   ```

## Step 4: Email from @propfolioph.com (15 minutes, then up to a day's wait)

So reminder emails come from your own domain and don't land in spam:

1. In Brevo: **Settings → Senders, Domains & Dedicated IPs → Domains → Add a domain** →
   `propfolioph.com`. Choose to set the records yourself.
2. Brevo shows 3–4 records (a Brevo code, DKIM, DMARC; sometimes SPF). For each one, in Namecheap
   **Advanced DNS → Add New Record**: type **TXT Record** (or CNAME if Brevo says so), **Host** and
   **Value** exactly as Brevo shows them. In the Host, leave out `.propfolioph.com` (Namecheap adds
   it): for `mail._domainkey.propfolioph.com` type `mail._domainkey`.
3. Back in Brevo, click **Authenticate**. It can take up to a day; you can carry on meanwhile.
4. In Brevo **Senders → Add a sender**: e.g. `Propfolio <hello@propfolioph.com>`.

To receive email at hello@propfolioph.com, turn on Namecheap's free **Email Forwarding**
(Domain List → Manage → **Redirect Email**) and forward `hello` to your Gmail.

## Step 5: Install and start (20 minutes)

In the droplet console:

```bash
sudo bash /opt/propfolio/deploy/setup.sh production
```

| Question                           | What to enter                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Your domain                        | `propfolioph.com`                                                                 |
| Brevo SMTP login / key             | From Brevo **Settings → SMTP & API → SMTP** (make a new SMTP key for this server) |
| Sender email address / name        | `hello@propfolioph.com` / `Propfolio`                                             |
| Support email shown on the website | `hello@propfolioph.com`                                                           |
| Xendit secret key                  | See Step 7. Press **Enter** to skip for now; you can add it later.                |

If it says the domain doesn't point to this server yet, wait a little (Step 2.4) and run the same
command again.

When it finishes, open **https://propfolioph.com**. The first visit can take a minute while the
secure certificate is issued.

## Step 6: Finish setting up (15 minutes)

1. **Make yourself platform admin** (to see accounts, payments, demo requests):

   ```bash
   cd /opt/propfolio/deploy && docker compose run --rm platform-admin --email you@example.com --name "Your Name"
   ```

   It prints a one-time link: open it, set a password and two-step sign-in.

2. **Off-site, encrypted backups**: `sudo bash /opt/propfolio/deploy/backup-setup.sh` (as on the
   test server). Keep the private key it shows in your password manager.
3. **Uptime alerts** (free): sign up at **uptimerobot.com → Add New Monitor** → type **HTTPS**,
   URL `https://propfolioph.com/api/health`, every 5 minutes, alert to your email (and phone app).
   You'll hear within minutes if the site goes down.
4. **Sign up as your own first customer** on https://propfolioph.com to check the whole journey.

## Step 7: Turn on payments with Xendit (when your Xendit account is approved)

1. In Xendit (**Live** mode, top left switch; use **Test** mode first to try it):
   - **Settings → API keys → Generate secret key**, permission **Money-in: Write**. Copy it.
   - **Settings → Webhooks**: set the **Invoices paid** URL to
     `https://propfolioph.com/api/v1/subscription/webhook/xendit`, tick **"Also notify my
     application when an invoice is expired"**, and copy the **verification token** shown on
     that page.
   - **Settings → Payment methods**: turn on Cards, GCash and Maya (and any others you want).
2. On the server, put them in the settings file:

   ```bash
   sudo nano /opt/propfolio/deploy/.env
   ```

   Add or change these three lines (paste your own values), then **Ctrl+O**, Enter, **Ctrl+X**:

   ```
   PAYMENT_PROVIDER=xendit
   XENDIT_SECRET_KEY='xnd_production_…'
   XENDIT_CALLBACK_TOKEN='…'
   ```

3. Restart: `cd /opt/propfolio/deploy && docker compose up -d`
4. Test with a real ₱1,500 payment (Choose Pro on your own account), then refund it in the Xendit
   dashboard. That ticks off the launch checklist's last payment items.

**How monthly payments work with Xendit:** on the renewal day, Propfolio makes the next month's
payment page and emails the Owner "Your payment for this month is ready". They pay with card,
GCash or Maya within 7 days and keep their plan meanwhile; reminders go on days 3 and 6. If it's
not paid by then, the account moves to Free (nothing is deleted).

## Updating later

Same as the test site, in this droplet's console: `sudo bash /opt/propfolio/deploy/update.sh`.
Update the test site first and check it, then the real one.

## If something goes wrong

| What you see                                     | What to do                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| "propfolioph.com points to … not to this server" | Step 2 isn't done or hasn't spread yet. Check dnschecker.org, wait, run Step 5 again.        |
| The browser says the site isn't secure           | Wait a minute and refresh. Check both A records in Step 2.                                   |
| www.propfolioph.com doesn't work                 | The `www` A record is missing (Step 2.3).                                                    |
| Emails land in spam                              | Brevo domain authentication (Step 4) isn't finished. Check it says "Authenticated" in Brevo. |
| A customer paid but the plan didn't change       | Check the Xendit webhook URL and token (Step 7.1). Send the developer the time of payment.   |
| Anything else                                    | `cd /opt/propfolio/deploy && docker compose ps` and `docker compose logs --tail 50 web`.     |
