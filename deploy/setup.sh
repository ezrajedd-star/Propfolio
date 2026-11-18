#!/usr/bin/env bash
# Propfolio — first-time setup on a fresh Ubuntu 24.04 server (run as root, from the repo).
#
#   sudo bash deploy/setup.sh              the test site (demo data, test banner, test payments)
#   sudo bash deploy/setup.sh production   the real site (your domain, real payments, no demo data)
#
# It installs Docker, turns on the firewall (only SSH, HTTP and HTTPS), adds swap memory if
# needed, asks a few questions, writes deploy/.env with fresh random secrets, builds and starts
# Propfolio with HTTPS, and schedules a daily backup. The test site also gets demo data.
# Safe to run again: it keeps an existing deploy/.env and never reloads demo data.
# Step-by-step guide for the real site: docs/production-setup.md.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ask() { local q="$1" d="${2:-}" a; read -r -p "$q${d:+ [$d]}: " a; echo "${a:-$d}"; }

MODE="${1:-test}"
[[ "$MODE" == "test" || "$MODE" == "production" ]] || { echo "Usage: sudo bash deploy/setup.sh [production]"; exit 1; }
[[ $EUID -eq 0 ]] || { echo "Please run with sudo: sudo bash deploy/setup.sh $MODE"; exit 1; }
grep -qi ubuntu /etc/os-release || echo "Warning: this script was written for Ubuntu 24.04."

say "Installing Docker and basic tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 ufw curl openssl git unattended-upgrades dnsutils >/dev/null
systemctl enable --now docker >/dev/null

say "Firewall: allowing only SSH, HTTP and HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

if [[ $(swapon --show | wc -l) -eq 0 && $(awk '/MemTotal/ {print $2}' /proc/meminfo) -lt 3500000 ]]; then
  say "Adding 2 GB of swap memory (building the app needs it on small servers)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [[ ! -f "$ENV_FILE" ]]; then
  say "A few questions (press Enter to accept the suggestion in brackets)"
  IP=$(curl -fsS --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
    || curl -fsS --max-time 5 https://api.ipify.org)
  FREE_ADDRESS="${IP//./-}.sslip.io"
  echo "Your server's address is $IP."
  [[ "$MODE" == "test" ]] && echo "Without your own domain, Propfolio will be at https://$FREE_ADDRESS"
  if [[ "$MODE" == "production" ]]; then
    SITE=$(ask "Your domain, without www (e.g. propfolioph.com)")
    [[ -n "$SITE" ]] || { echo "The real site needs your own domain."; exit 1; }
    SITE="${SITE#https://}"; SITE="${SITE#www.}"; SITE="${SITE%/}"
    POINTS_TO=$(dig +short A "$SITE" | tail -1)
    if [[ "$POINTS_TO" != "$IP" ]]; then
      echo "⚠ $SITE points to '${POINTS_TO:-nothing}', not to this server ($IP)."
      echo "  Set the A records in Namecheap first (docs/production-setup.md, step 2), wait a few"
      echo "  minutes, then run this again. (Otherwise the secure certificate can't be issued.)"
      exit 1
    fi
  else
    SITE=$(ask "Web address (your own domain, or Enter for the free one)" "$FREE_ADDRESS")
  fi
  echo
  echo "Email (Brevo): in Brevo go to Settings → SMTP & API → SMTP. Use the 'Login' and an SMTP key."
  SMTP_USER=$(ask "Brevo SMTP login (looks like 9a1b2c001@smtp-brevo.com)")
  read -r -s -p "Brevo SMTP key (hidden while you type/paste): " SMTP_PASSWORD; echo
  SENDER=$(ask "Sender email address (verified in Brevo → Senders)")
  COMPANY_FROM=$(ask "Sender name" "Propfolio")
  if [[ "$MODE" == "production" ]]; then
    SUPPORT=$(ask "Support email shown on the website (e.g. hello@$SITE)")
    echo
    echo "Payments (Xendit): Dashboard → Settings → API keys (secret key, with Money-in write access)"
    echo "and Settings → Webhooks (verification token). Press Enter to skip: paying online stays off"
    echo "and customers are asked to email you; add the keys later with the guide."
    read -r -s -p "Xendit secret key (hidden): " XENDIT_KEY; echo
    XENDIT_TOKEN=""
    [[ -n "$XENDIT_KEY" ]] && { read -r -s -p "Xendit webhook verification token (hidden): " XENDIT_TOKEN; echo; }
    PROVIDER=$([[ -n "$XENDIT_KEY" && -n "$XENDIT_TOKEN" ]] && echo xendit || echo none)
    UAT=false
  else
    DEMO_PASSWORD=$(ask "Password for the 3 demo accounts (Enter to generate one)" "$(openssl rand -base64 12 | tr -d '/+=')Aa1")
    UAT=true
  fi

  umask 077
  cat > "$ENV_FILE" <<ENVEOF
# Written by deploy/setup.sh on $(date -u +%F). Keep this file secret; it is not in Git.
SITE_ADDRESS=$SITE
APP_URL=https://$SITE
UAT_MODE=$UAT
POSTGRES_PASSWORD=$(openssl rand -hex 24)
APP_SECRET=$(openssl rand -hex 32)
MAIL_FROM="$COMPANY_FROM <$SENDER>"
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER='$SMTP_USER'
SMTP_PASSWORD='$SMTP_PASSWORD'
ENVEOF
  if [[ "$MODE" == "production" ]]; then
    cat >> "$ENV_FILE" <<ENVEOF
SUPPORT_EMAIL='$SUPPORT'
PAYMENT_PROVIDER=$PROVIDER
XENDIT_SECRET_KEY='$XENDIT_KEY'
XENDIT_CALLBACK_TOKEN='$XENDIT_TOKEN'
ENVEOF
  else
    echo "SEED_PASSWORD='$DEMO_PASSWORD'" >> "$ENV_FILE"
  fi
  echo "Saved settings to $ENV_FILE (readable by root only)."
else
  echo "Keeping the existing settings in $ENV_FILE."
fi

cd "$DEPLOY_DIR"
say "Building Propfolio (about 5–10 minutes the first time)"
docker compose build
say "Starting Propfolio"
docker compose up -d

FIRST_RUN_MARK="$DEPLOY_DIR/.seeded"
if [[ "$MODE" == "test" && ! -f "$FIRST_RUN_MARK" ]]; then
  say "Loading the demo data (made-up buildings, tenants, leases and payments)"
  docker compose run --rm seed
  touch "$FIRST_RUN_MARK"
fi

say "Scheduling a daily backup at 02:30 Manila time"
chmod +x "$DEPLOY_DIR/backup.sh" "$DEPLOY_DIR/update.sh"
echo "30 18 * * * root $DEPLOY_DIR/backup.sh >> /var/log/propfolio-backup.log 2>&1" > /etc/cron.d/propfolio-backup

# shellcheck disable=SC1090
source "$ENV_FILE"
say "Done!"
if [[ "$MODE" == "production" ]]; then
  cat <<DONE

  Propfolio:   $APP_URL   (and https://www.$SITE_ADDRESS, which goes to the same place)
  (The secure certificate can take a minute on the first visit.)

  Next (docs/production-setup.md):
    • Add yourself as platform admin:
        cd $DEPLOY_DIR && docker compose run --rm platform-admin --email you@example.com --name "Your Name"
    • Sign up on the website as your own first customer, to check everything.
    • Turn on off-site backups:  sudo bash $DEPLOY_DIR/backup-setup.sh
    • Payments: ${PAYMENT_PROVIDER} — webhook address for Xendit: $APP_URL/api/v1/subscription/webhook/xendit

  Update to the newest version later:  sudo bash $DEPLOY_DIR/update.sh
DONE
else
  cat <<DONE

  Propfolio:   $APP_URL
  (The secure certificate can take a minute on the first visit.)

  Demo sign-ins (password: $SEED_PASSWORD)
    admin@propfolio.test    Admin — use this to add your testers in Settings → Users
    leasing@propfolio.test  Leasing Staff
    viewer@propfolio.test   Property Management

  Update to the newest version later:  sudo bash $DEPLOY_DIR/update.sh
DONE
fi
