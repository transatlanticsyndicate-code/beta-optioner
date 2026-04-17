#!/bin/bash

# Local build + SSH deploy to crypto.optioner.online
# Vite SPA → rsync static build to /var/www/crypto
# Usage: ./scripts/deploy_crypto.sh
# Requires: ssh alias "gelimo" OR direct SSH to root@89.117.52.143

set -euo pipefail

# ============== Config ==============
SSH_HOST="root@89.117.52.143"
REMOTE_DIR="/var/www/crypto"
LOCAL_CRYPTO="$(cd "$(dirname "$0")/.." && pwd)/crypto"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy-crypto]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy-crypto]${NC} $1"; }
fail() { echo -e "${RED}[deploy-crypto]${NC} $1"; exit 1; }

# ============== Pre-flight ==============
log "Checking SSH connection..."
ssh -o ConnectTimeout=5 "$SSH_HOST" "echo ok" > /dev/null 2>&1 || fail "Cannot connect to $SSH_HOST. Check ~/.ssh/config."

[[ -f "$LOCAL_CRYPTO/.env.local" ]] || fail "crypto/.env.local not found. Needed for Vite build (VITE_SUPABASE_* keys)."

# ============== Build ==============
log "Installing dependencies..."
cd "$LOCAL_CRYPTO"
npm install --silent

log "Building crypto SPA (Vite)..."
npm run build 2>&1 | tail -20

[[ -d "dist" && -f "dist/index.html" ]] || fail "Build failed — dist/index.html not found."
log "Build size: $(du -sh dist | cut -f1)"

# ============== Backup current prod ==============
# ЗАЧЕМ: при первом деплое из монорепо — чтобы можно было откатиться если что-то не так
BACKUP_NAME="crypto.backup.$(date +%Y%m%d-%H%M%S)"
log "Creating server-side backup at $REMOTE_DIR -> /var/www/$BACKUP_NAME (retained for rollback)..."
ssh "$SSH_HOST" "[ -d $REMOTE_DIR ] && cp -r $REMOTE_DIR /var/www/$BACKUP_NAME || echo '(no existing dir to back up)'"

# ============== Upload ==============
log "Uploading dist/ to $SSH_HOST:$REMOTE_DIR/ ..."
rsync -az --delete \
  --exclude='.DS_Store' \
  -e "ssh" \
  "$LOCAL_CRYPTO/dist/" \
  "$SSH_HOST:$REMOTE_DIR/"

# ============== Verify ==============
log "Smoke test..."
sleep 1
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -L https://crypto.optioner.online/ 2>/dev/null || echo 000)
if [[ "$HTTP_STATUS" == "200" ]]; then
  log "Site is live (HTTP $HTTP_STATUS)"
else
  warn "Site returned HTTP $HTTP_STATUS — check nginx on server: ssh $SSH_HOST 'nginx -t && tail -30 /var/log/nginx/error.log'"
fi

log "=========================================="
log "Deploy complete: https://crypto.optioner.online"
log "Backup kept at: /var/www/$BACKUP_NAME"
log "=========================================="
