# Putting Propfolio online for testing (UAT)

This puts a **test version** of Propfolio on a small cloud server in **Singapore**, at a secure
`https://` address that testers open in their browser. It uses made-up demo data, sends real
emails through **Brevo**, and backs itself up every night.

**Time:** about 45 minutes, mostly waiting. **Cost:** about US$12–15 a month for the server
(Brevo's free plan covers the emails). You can delete the server any time to stop paying.

You'll need: a card for DigitalOcean, access to the `ezrajedd-star/Propfolio` GitHub repository,
and an email address you can receive mail at (to verify the sender in Brevo).

> **Use made-up data only.** The test version shows a banner saying so. Don't enter real tenants'
> personal details until the production set-up (Phase 7) is done.

---

## Step 1 — Set up email with Brevo (10 minutes)

1. Sign up at **brevo.com** (free plan).
2. Add your sender: **Settings → Senders, domains & dedicated IPs → Senders → Add a sender**. Use
   the address emails should come from, e.g. `leasing@yourcompany.com`. Brevo emails a link to
   that address; click it to verify.
   _Optional but better:_ under **Domains**, add your company domain and follow the steps to add
   its DNS records. Emails are then less likely to land in spam.
3. Get the SMTP login: **Settings → SMTP & API → SMTP**. Note the **Login** (looks like
   `9a1b2c001@smtp-brevo.com`), then **Generate a new SMTP key** and copy it somewhere safe.
   You'll paste both in Step 4.

## Step 2 — Create the server on DigitalOcean (10 minutes)

1. Sign up at **digitalocean.com** and create a project (e.g. "Propfolio").
2. **Create → Droplets**:
   - **Region:** Singapore (SGP1)
   - **Image:** Ubuntu **24.04 (LTS) x64**
   - **Size:** Basic → Regular → **2 GB RAM / 1 CPU** (about US$12/month)
   - **Authentication:** Password. Choose a long password and keep it safe. (SSH keys are better
     if you know how to use them.)
   - **Backups:** turn on **weekly backups** (about 20% extra). They copy the whole server off-site.
   - **Hostname:** `propfolio-uat`
3. Click **Create Droplet** and wait until it shows an IP address, e.g. `203.0.113.25`.

## Step 3 — Let the server download Propfolio (5 minutes)

The repository is private, so the server needs its own read-only key.

1. In DigitalOcean, open the droplet and click **Console** (top right). A black terminal window opens
   in your browser, already signed in as `root`.
2. Paste this and press Enter (to paste in the console use right-click → Paste, or Ctrl+Shift+V):

   ```bash
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C propfolio-uat && cat ~/.ssh/id_ed25519.pub
   ```

   It prints one line starting with `ssh-ed25519`. Select and copy that whole line.

3. On GitHub, open **ezrajedd-star/Propfolio → Settings → Deploy keys → Add deploy key**. Title:
   `propfolio-uat server`. Paste the line into **Key**. Leave **Allow write access** unticked.
   Click **Add key**.
4. Back in the console, paste:

   ```bash
   ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
   git clone --branch claude/tender-mendel-owpm2c git@github.com:ezrajedd-star/Propfolio.git /opt/propfolio
   ```

   You should see `Receiving objects: 100%`.

## Step 4 — Install and start Propfolio (15–20 minutes)

In the same console, paste:

```bash
sudo bash /opt/propfolio/deploy/setup.sh
```

It asks a few questions. Press Enter to accept a suggestion in [brackets]:

| Question                   | What to enter                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Web address                | Press **Enter** to use the free address it suggests (like `203-0-113-25.sslip.io`). If you own a domain, see "Using your own domain" below. |
| Brevo SMTP login           | The **Login** from Step 1                                                                                                                   |
| Brevo SMTP key             | The **SMTP key** from Step 1 (nothing shows while you paste; that's normal)                                                                 |
| Sender email address       | The sender you verified in Brevo                                                                                                            |
| Sender name                | e.g. `Propfolio` or your company name                                                                                                       |
| Password for demo accounts | Press **Enter** to generate one                                                                                                             |

Then it builds and starts everything. When it finishes it prints:

```
Propfolio:   https://203-0-113-25.sslip.io
Demo sign-ins (password: ...)
  admin@propfolio.test    Admin — use this to add your testers in Settings → Users
```

**Copy the address and password somewhere safe.** Open the address in your browser. The first
visit can take a minute while the secure certificate is issued.

## Step 5 — Prepare it for your testers (10 minutes)

1. Sign in as `admin@propfolio.test`. The welcome tour appears; take it.
2. **Settings → General:** enter your company name.
3. **Settings → Users → Add user** for each tester, with their real email and the right role:
   - **Leasing Staff:** creates leases, records payments, runs reports
   - **Admin:** also manages users and settings
   - **Property Management (Viewer):** read-only: units, occupancy and lease dates

   Propfolio shows a **temporary password** once for each person. Send it to them privately, for
   example by text message (not in the same email as the link). They choose their own password at
   first sign-in.

4. **Settings → Reminder emails:** check your testers are listed. The daily email goes out at
   06:00 Manila time.

## Step 6 — Invite your testers

Copy, adjust and send:

> **Subject: Please help test Propfolio, our new lease system**
>
> Hi [name],
>
> We're testing Propfolio, the new system for leases, rent and reminders, and would value your
> help between [date] and [date].
>
> 1. Open **https://[your address]** (works in Chrome, Edge or Safari, and on phones).
> 2. Sign in with this email address and the temporary password I'll text you. You'll choose your
>    own password.
> 3. A short tour starts. After that, press **Guide** at any time to see what each button does.
> 4. Please try: finding a lease, checking what is expiring, recording a payment, renewing a
>    lease, and opening a report.
> 5. If anything goes wrong or is confusing, press **Send feedback** and tell us in your own words.
>    It records which page you were on.
>
> Everything in it is made-up test data. Please don't enter real tenants' details.
>
> Thank you!

Read their notes in **Settings → Tester feedback** (with a "Download for Excel" button). Mark each
one done when it's dealt with.

---

## Later

- **Get the newest version** after we change something: open the droplet **Console** and run
  `sudo bash /opt/propfolio/deploy/update.sh`. It backs up first, then updates. Data is kept.
- **Backups:** every night at 02:30 Manila time to `/var/backups/propfolio` on the server (kept 14
  days), plus DigitalOcean's weekly off-site backup if you turned it on.
- **Start again with fresh demo data:**
  `cd /opt/propfolio/deploy && docker compose down -v && rm .seeded && sudo bash ../deploy/setup.sh`.
  This **deletes everything** on the test server.
- **Stop paying:** destroy the droplet in DigitalOcean (Droplet → Destroy). Delete the deploy key
  on GitHub too.

## Using your own domain (optional)

If you own a domain, e.g. `yourcompany.com`, you can use `uat.yourcompany.com` instead of the free
address:

1. In your domain's DNS settings, add an **A record**: name `uat`, value = the droplet's IP address.
2. Wait about 10 minutes, then use `uat.yourcompany.com` as the web address in Step 4. If you
   already ran the setup, edit `/opt/propfolio/deploy/.env` (change `SITE_ADDRESS` and `APP_URL`)
   and run `cd /opt/propfolio/deploy && docker compose up -d`.

## If something goes wrong

| What you see                                               | What to do                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Permission denied (publickey)` in Step 3                  | The deploy key wasn't added, or a character was missed when copying. Repeat Step 3.2–3.4.                                          |
| The setup stops during "Building"                          | Run `sudo bash /opt/propfolio/deploy/setup.sh` again. It keeps your answers and continues.                                         |
| The browser says the site isn't secure or can't be reached | Wait a minute and refresh. Check the droplet is on, and that you used `https://`.                                                  |
| Testers don't get emails                                   | Check spam. In Brevo, check the sender is verified and see **Transactional → Logs**. Admins can still give temporary passwords.    |
| Anything else                                              | Run `cd /opt/propfolio/deploy && docker compose ps` and `docker compose logs --tail 50 web`, and send the output to the developer. |

## How it is set up (for IT)

- One Ubuntu 24.04 droplet running Docker Compose (`deploy/docker-compose.yml`): **Caddy** (HTTPS
  with automatic Let's Encrypt certificates and HTTP → HTTPS redirect), **web** (Next.js),
  **worker** (daily jobs), **PostgreSQL 16**, and a private volume for uploaded documents.
- Firewall (ufw): only 22, 80 and 443 are open. Postgres and the app are not reachable from the
  internet. Ubuntu security updates install automatically.
- Secrets are generated on the server into `deploy/.env` (root-only, never in Git):
  `POSTGRES_PASSWORD` and `APP_SECRET` are random; the SMTP key is the one you pasted.
- Emails to the demo `.test` accounts are skipped, so they don't harm your sender reputation.
- For production (Phase 7) we'll move the database to managed PostgreSQL and the documents to a
  private S3 bucket (both encrypted at rest), as the brief plans, and add off-site backups.
