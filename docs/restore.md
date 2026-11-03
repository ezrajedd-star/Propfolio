# Restoring Propfolio from a backup

Backups run every night at 02:30 Manila time (`deploy/backup.sh`, scheduled by `deploy/setup.sh`):

| Where                                                   | What                                                   | Kept    | Opened with                 |
| ------------------------------------------------------- | ------------------------------------------------------ | ------- | --------------------------- |
| On the server, `/var/backups/propfolio`                 | `db-<date>.dump` (database), `documents-<date>.tar.gz` | 14 days | nothing extra               |
| Off-site storage (e.g. Backblaze B2), `propfolio/` path | the same two files, **encrypted** (`.age` at the end)  | 30 days | your **backup private key** |

Set up the off-site part once with `sudo bash deploy/backup-setup.sh`. It shows the backup
private key **once**: keep it in your password manager. It is not on the server, so someone who
breaks into the server can't open the off-site backups, and **without it nobody can, including
you**.

> **Tested:** on 3 Nov 2026 a backup made by `deploy/backup.sh` was encrypted, "uploaded",
> decrypted with the private key and restored into an empty database with the steps below. All
> 31 tables matched the original row for row, payment totals matched to the centavo, the
> database's account-separation rules came back, and so did the documents. Repeat this test
> every 3 months (it takes about 20 minutes) and write the date here.

---

## A. Undo a mistake from the last 14 days (same server)

Use this when the server is fine but data went wrong (e.g. something was deleted by accident).
**It replaces everything in Propfolio with the backup**, so changes since then are lost.

1. Open the server console (DigitalOcean → your droplet → **Console**).
2. See the backups: `ls -lh /var/backups/propfolio`
3. Make a backup of the current state first, just in case: `sudo bash /opt/propfolio/deploy/backup.sh`
4. Stop the app (the database keeps running):
   ```bash
   cd /opt/propfolio/deploy && docker compose stop web worker
   ```
5. Restore the database (put the date you want instead of `DATE`):
   ```bash
   docker compose exec -T postgres dropdb -U propfolio propfolio
   docker compose exec -T postgres createdb -U propfolio propfolio
   docker compose exec -T postgres pg_restore -U propfolio -d propfolio --no-owner --exit-on-error \
     < /var/backups/propfolio/db-DATE.dump
   ```
6. Restore the documents:
   ```bash
   docker run --rm -v propfolio_documents:/documents -v /var/backups/propfolio:/backup:ro alpine:3.22 \
     sh -c "rm -rf /documents/* && tar xzf /backup/documents-DATE.tar.gz -C /documents"
   ```
7. Start the app again: `docker compose up -d`, then sign in and check a few leases and payments.

## B. The server is gone (new server, off-site backup)

1. Create a new server and install Propfolio with `docs/deploy-uat.md` (Steps 2–4). **Don't load
   the demo data** (answer the questions, then skip Step 5).
2. Copy the backup files to your computer: in Backblaze, open the bucket → `propfolio/` and
   download the newest `db-….dump.age` and `documents-….tar.gz.age`. Upload both to the server's
   `/root` (or use `rclone` as in `deploy/backup.sh`).
3. Put your backup private key in a file on the server, readable only by root, and decrypt:
   ```bash
   sudo -i
   umask 077 && nano /root/backup-key.txt   # paste the AGE-SECRET-KEY-… line, save
   apt-get install -y age
   age --decrypt --identity /root/backup-key.txt --output /root/db.dump /root/db-DATE.dump.age
   age --decrypt --identity /root/backup-key.txt --output /root/documents.tar.gz /root/documents-DATE.tar.gz.age
   shred -u /root/backup-key.txt               # don't leave the key on the server
   ```
4. Restore into the new, empty database. The restricted role used for account separation must
   exist first:
   ```bash
   cd /opt/propfolio/deploy && docker compose stop web worker
   docker compose exec -T postgres dropdb -U propfolio propfolio
   docker compose exec -T postgres createdb -U propfolio propfolio
   docker compose exec -T postgres psql -U propfolio -d propfolio -c \
     "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='propfolio_tenant') THEN CREATE ROLE propfolio_tenant NOLOGIN; END IF; END \$\$; GRANT propfolio_tenant TO propfolio;"
   docker compose exec -T postgres pg_restore -U propfolio -d propfolio --no-owner --exit-on-error < /root/db.dump
   docker run --rm -v propfolio_documents:/documents -v /root:/backup:ro alpine:3.22 \
     sh -c "rm -rf /documents/* && tar xzf /backup/documents.tar.gz -C /documents"
   docker compose up -d
   ```
5. **The new server must use the same `APP_SECRET`** as the old one (it encrypts the two-step
   sign-in secrets and recovery codes). If it was lost too, everyone sets up two-step sign-in
   again: platform admins with `docker compose run --rm platform-admin --email …`, customers
   when an Admin resets it for them.
6. Point your domain (or tell testers the new address), sign in, and check a few leases,
   payments and documents. Then `rm /root/db.dump /root/documents.tar.gz`.

## C. How to run the quarterly restore test

On any computer with PostgreSQL 16 and `age`: download last night's two `.age` files, decrypt
them with the private key (step B.3), restore into a scratch database (step B.4, with
`createdb propfolio_restore_test`), and compare row counts with the live site
(`SELECT count(*) FROM "Lease"` etc.). Delete the scratch database and decrypted files after.
