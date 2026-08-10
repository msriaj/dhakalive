#!/usr/bin/env bash
#
# Restrict 80/443 to Cloudflare's published ranges.
#
# The site is proxied, so every legitimate request arrives from Cloudflare.
# Leaving the ports open to the world lets anyone reach the origin directly by
# IP, which bypasses the WAF, the rate limiting and the cache, and exposes the
# origin address to anyone scanning.
#
# Cloudflare changes these ranges rarely, but it does change them. Re-run this
# after a change, and re-run docker/Caddyfile's trusted_proxies list with the
# same values — a range that is firewalled in but not trusted yields the wrong
# client IP in logs.
#
#   sudo ./scripts/firewall-cloudflare.sh
#
# Pass --dry-run to print the rules without applying them.

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# Both checks are skipped for --dry-run so the rules can be reviewed from any
# machine, including the one you are writing them on.
if [[ "$DRY_RUN" == false ]]; then
  if ! command -v ufw >/dev/null 2>&1; then
    echo "ufw is not installed. This script only knows how to drive ufw." >&2
    exit 1
  fi

  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run as root (sudo) — ufw needs it." >&2
    exit 1
  fi
fi

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

# Fetch first, apply second. A half-applied rule set on a firewalled box is a
# lockout waiting to happen, so nothing is touched until both lists are in hand.
log "Fetching Cloudflare ranges"
V4="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)"
V6="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)"

if [[ -z "$V4" || -z "$V6" ]]; then
  echo "Cloudflare returned an empty range list; refusing to change the firewall." >&2
  exit 1
fi

RANGES=()
while IFS= read -r cidr; do [[ -n "$cidr" ]] && RANGES+=("$cidr"); done <<<"$V4"
while IFS= read -r cidr; do [[ -n "$cidr" ]] && RANGES+=("$cidr"); done <<<"$V6"

log "${#RANGES[@]} ranges"

if [[ "$DRY_RUN" == true ]]; then
  for cidr in "${RANGES[@]}"; do
    echo "  ufw allow from $cidr to any port 80,443 proto tcp"
  done
  echo
  echo "Would then delete any blanket 'ufw allow 80/443' rules."
  exit 0
fi

# SSH first and explicitly. If anything below goes wrong, the box is still
# reachable.
log "Ensuring SSH stays permitted"
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp

log "Allowing Cloudflare to reach 80 and 443"
for cidr in "${RANGES[@]}"; do
  ufw allow from "$cidr" to any port 80,443 proto tcp comment 'cloudflare' >/dev/null
done

# Drop the open-to-the-world rules the bootstrap script may have added. Deleting
# by rule number shifts the remaining numbers, so this re-reads the list each
# time rather than collecting numbers up front.
log "Removing any world-open 80/443 rules"
while true; do
  num="$(ufw status numbered \
    | grep -E '^\[[ 0-9]+\] (80|443)(/tcp)?[[:space:]]+ALLOW IN[[:space:]]+Anywhere' \
    | head -1 | sed -E 's/^\[[[:space:]]*([0-9]+)\].*/\1/')" || true
  [[ -z "$num" ]] && break
  yes | ufw delete "$num" >/dev/null
done

log "Done. Current rules:"
ufw status verbose | sed 's/^/  /'

cat <<'EOF'

The origin is now reachable on 80/443 only from Cloudflare.

Verify from a machine that is not Cloudflare — this should now hang or refuse:
  curl -m 10 http://<origin-ip>/

And the site should still load:
  curl -sI https://dhakalive.com | head -1
EOF
