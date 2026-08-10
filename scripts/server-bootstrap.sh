#!/usr/bin/env bash
#
# Prepares a fresh Ubuntu 24.04 server to run DhakaLive.
#
# Idempotent: safe to re-run. Installs Docker, creates a deploy user, adds swap,
# configures the firewall and lays out the directories the deploy expects.
#
#   curl -fsSL https://raw.githubusercontent.com/msriaj/dhakalive/main/scripts/server-bootstrap.sh -o bootstrap.sh
#   sudo bash bootstrap.sh
#
# Review it before running it as root. That applies to any script you pipe from
# the internet, including this one.

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/www/DHAKALIVE}"
REPO_URL="${REPO_URL:-https://github.com/msriaj/dhakalive.git}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw fail2ban >/dev/null

log "Swap (${SWAP_SIZE})"
# Cheap insurance even with 2 GB: it turns a traffic spike into a slow minute
# instead of the kernel OOM-killing a process of its own choosing.
if swapon --show | grep -q '/swapfile'; then
  echo "  swap already active"
else
  fallocate -l "${SWAP_SIZE}" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo "  ${SWAP_SIZE} swap enabled"
fi
# Prefer RAM, but swap rather than kill. 10 is a reasonable middle ground for a
# small box running a JS runtime.
sysctl -qw vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >>/etc/sysctl.conf

log "Docker"
if command -v docker >/dev/null 2>&1; then
  echo "  already installed: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  echo "  installed: $(docker --version)"
fi

log "Docker log rotation"
# Without this, container logs grow until they fill a 25 GB disk. Ask anyone who
# has debugged a "disk full" outage that was only ever logs.
cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl restart docker

log "Deploy user: ${DEPLOY_USER}"
if id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  echo "  already exists"
else
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"

# Carry root's authorised keys over so you are not locked out.
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  install -m 600 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" \
    /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  echo "  copied root's authorized_keys"
fi

log "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status numbered | sed 's/^/  /'
echo "  NOTE: 80/443 are open to the world so you can reach the origin by IP"
echo "        before DNS is switched. Once Cloudflare fronts the site, restrict"
echo "        them to Cloudflare's ranges — see docs/deployment.md."

log "Application directory: ${DEPLOY_PATH}"
if [ -d "${DEPLOY_PATH}/.git" ]; then
  echo "  repository already present"
else
  git clone "${REPO_URL}" "${DEPLOY_PATH}"
fi
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_PATH}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${DEPLOY_PATH}/docker/postgres/backups"

# The app and database stacks share this network; the database joins it as an
# external network so it never has to publish a port.
docker network inspect dhakalive_default >/dev/null 2>&1 || docker network create dhakalive_default >/dev/null
echo "  docker network ready"

log "Done"
cat <<EOF

Next:

  1. Create the environment file — it is never committed:
       sudo -u ${DEPLOY_USER} cp ${DEPLOY_PATH}/.env.example ${DEPLOY_PATH}/.env
       sudo -u ${DEPLOY_USER} nano ${DEPLOY_PATH}/.env

     Required for production:
       APP_ENV=production
       DATABASE_URI=postgres://dhakalive:<password>@postgres:5432/dhakalive
       DATABASE_SSL=false        # in-Docker traffic never leaves the host
       DATABASE_ALLOW_UNENCRYPTED=true   # required alongside DATABASE_SSL=false
       PAYLOAD_SECRET=\$(openssl rand -base64 48)
       REVALIDATION_SECRET=\$(openssl rand -hex 32)
       POSTGRES_PASSWORD=<the same password as in DATABASE_URI>

  2. Start the database, then the app:
       cd ${DEPLOY_PATH}
       docker compose --env-file .env -f docker/docker-compose.postgres.yml up -d
       docker compose --env-file .env -f docker/docker-compose.prod.yml run --rm migrate
       docker compose --env-file .env -f docker/docker-compose.prod.yml up -d

  3. Add the deploy key to GitHub so CI can release:
       sudo -u ${DEPLOY_USER} ssh-keygen -t ed25519 -C deploy -f /home/${DEPLOY_USER}/.ssh/deploy_key
     Put the PRIVATE key in the repo's production environment as DEPLOY_SSH_KEY,
     and append the PUBLIC key to /home/${DEPLOY_USER}/.ssh/authorized_keys.

  4. Create the first CMS user at http://<server-ip>:3000/admin — that path is
     open exactly once, while the users table is empty. Do it now, not later.

EOF
