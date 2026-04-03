#!/bin/bash

# Local build + SSH deploy to beta.optioner.online
# Usage: ./scripts/deploy_local.sh
# Requires: ssh alias "gelimo" in ~/.ssh/config

set -euo pipefail

# ============== Config ==============
SSH_HOST="gelimo"
REMOTE_DIR="/var/www/beta"
LOCAL_FRONTEND="$(cd "$(dirname "$0")/.." && pwd)/frontend"
PM2_APP="optioner-backend-beta"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
fail() { echo -e "${RED}[deploy]${NC} $1"; exit 1; }

# ============== Pre-flight ==============
log "Checking SSH connection..."
ssh -o ConnectTimeout=5 "$SSH_HOST" "echo ok" > /dev/null 2>&1 || fail "Cannot connect to $SSH_HOST. Check ~/.ssh/config."

# ============== Build ==============
log "Building frontend locally..."
cd "$LOCAL_FRONTEND"

export GENERATE_SOURCEMAP=false
export CI=false

npm run build 2>&1 | tail -20

[[ -d "build" && -f "build/index.html" ]] || fail "Build failed — build/index.html not found."
log "Build size: $(du -sh build | cut -f1)"

# ============== Upload ==============
log "Uploading build to $SSH_HOST:$REMOTE_DIR/frontend/build ..."
rsync -az --delete \
  --exclude='.DS_Store' \
  -e "ssh" \
  "$LOCAL_FRONTEND/build/" \
  "$SSH_HOST:$REMOTE_DIR/frontend/build/"

log "Uploading backend..."
rsync -az --delete \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.env' \
  --exclude='venv/' \
  --exclude='*.db' \
  --exclude='*.db-journal' \
  -e "ssh" \
  "$(dirname "$LOCAL_FRONTEND")/backend/" \
  "$SSH_HOST:$REMOTE_DIR/backend/"

# ============== Restart ==============
log "Restarting backend on server..."
ssh "$SSH_HOST" "
  cd $REMOTE_DIR/backend
  source venv/bin/activate
  pip install -r requirements.txt -q
  pm2 restart $PM2_APP 2>/dev/null || pm2 start $REMOTE_DIR/ecosystem.beta.config.js
  pm2 save
"

# ============== Verify ==============
log "Smoke test..."
sleep 2
HTTP_STATUS=$(ssh "$SSH_HOST" "curl -s -o /dev/null -w '%{http_code}' http://localhost:8002/api/health 2>/dev/null || echo 000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  log "Backend healthy (HTTP $HTTP_STATUS)"
else
  warn "Backend returned HTTP $HTTP_STATUS — check logs: ssh $SSH_HOST 'pm2 logs $PM2_APP --lines 20'"
fi

log "=========================================="
log "Deploy complete: https://beta.optioner.online"
log "=========================================="
