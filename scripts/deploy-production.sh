#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROD_HOST="${PROD_HOST:-chatdeedee.callincloud.com}"
PROD_USER="${PROD_USER:-root}"
PROD_DIR="${PROD_DIR:-/opt/chatcenter-ai}"
PROD_URL="${PROD_URL:-https://chatdeedee.callincloud.com}"
PROD_PORT="${PROD_PORT:-3000}"
PM2_PROCESS="${PM2_PROCESS:-chatcenter-ai}"
ADMIN_PASSCODE="${ADMIN_PASSCODE:-passcode2026test}"

SSH_TARGET="${PROD_USER}@${PROD_HOST}"
REMOTE_TMP="/tmp/chatcenter-deploy-manifest.$$"

log() {
  printf '\n==> %s\n' "$*"
}

remote() {
  ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "$@"
}

cleanup() {
  rm -f "$REMOTE_TMP.local" "$REMOTE_TMP.remote" "$REMOTE_TMP.headers" "$REMOTE_TMP.body" "$REMOTE_TMP.cookie" "$REMOTE_TMP.asset"
}
trap cleanup EXIT

cd "$ROOT_DIR"

log "Checking local syntax"
node --check index.js

log "Preparing production backup"
BACKUP_DIR="$(remote "bash -s" <<'REMOTE'
set -Eeuo pipefail
PROD_DIR="${PROD_DIR:-/opt/chatcenter-ai}"
BACKUP_DIR="/root/chatcenter-prod-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

cp -a "$PROD_DIR/.env" "$BACKUP_DIR/.env.before-deploy"
cp -a "$PROD_DIR/package.json" "$PROD_DIR/package-lock.json" "$BACKUP_DIR/" 2>/dev/null || true
mkdir -p "$BACKUP_DIR/public-assets-brand" "$BACKUP_DIR/public-assets-instructions" "$BACKUP_DIR/runtime"
cp -a "$PROD_DIR/public/assets/brand" "$BACKUP_DIR/public-assets-brand/" 2>/dev/null || true
cp -a "$PROD_DIR/public/assets/instructions" "$BACKUP_DIR/public-assets-instructions/" 2>/dev/null || true
cp -a "$PROD_DIR/uploads" "$PROD_DIR/storage" "$PROD_DIR/data" "$PROD_DIR/tmp" "$BACKUP_DIR/runtime/" 2>/dev/null || true
pm2 status > "$BACKUP_DIR/pm2-status.before-deploy"
find "$PROD_DIR" -maxdepth 3 -type f \( -name package.json -o -name index.js -o -name .env \) -print > "$BACKUP_DIR/file-inventory.before-deploy"
date -u > "$BACKUP_DIR/timestamp.before-deploy"
printf '%s' "$BACKUP_DIR" > /root/chatcenter-prod-deploy-latest-dir
printf '%s\n' "$BACKUP_DIR"
REMOTE
)"
printf 'backup_dir=%s\n' "$BACKUP_DIR"

log "Checking dependency manifest"
sha256sum package.json package-lock.json > "$REMOTE_TMP.local"
if remote "cd '$PROD_DIR' && sha256sum package.json package-lock.json" > "$REMOTE_TMP.remote" 2>/dev/null; then
  if cmp -s "$REMOTE_TMP.local" "$REMOTE_TMP.remote"; then
    NEED_NPM_CI=0
  else
    NEED_NPM_CI=1
  fi
else
  NEED_NPM_CI=1
fi

log "Syncing application code"
rsync -az --delete \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='public/assets/' \
  --exclude='uploads/' \
  --exclude='storage/' \
  --exclude='data/' \
  --exclude='tmp/' \
  --exclude='.DS_Store' \
  --exclude='.playwright-cli/' \
  --exclude='output/playwright/' \
  --exclude='*.log' \
  --exclude='npm-debug.log*' \
  "$ROOT_DIR/" "$SSH_TARGET:$PROD_DIR/"

log "Syncing public assets without deletion"
rsync -az "$ROOT_DIR/public/assets/" "$SSH_TARGET:$PROD_DIR/public/assets/"

log "Restarting production"
if [[ "$NEED_NPM_CI" == "1" ]]; then
  INSTALL_CMD="npm ci --omit=dev"
else
  INSTALL_CMD="printf 'package manifests unchanged; skipping npm ci\n'"
fi

remote "cd '$PROD_DIR' && node --check index.js && $INSTALL_CMD && pm2 restart '$PM2_PROCESS' --update-env && sleep 5 && pm2 status '$PM2_PROCESS' && curl -fsS 'http://127.0.0.1:$PROD_PORT/health' && pm2 save"

log "Checking public production"
curl -fsS "$PROD_URL/health"
printf '\n'

COOKIE_FILE="$REMOTE_TMP.cookie"
LOGIN_CODE="$(curl -ksS -D "$REMOTE_TMP.headers" -o "$REMOTE_TMP.body" -c "$COOKIE_FILE" \
  -H 'Content-Type: application/json' \
  -X POST "$PROD_URL/admin/login" \
  --data "{\"passcode\":\"$ADMIN_PASSCODE\"}" \
  -w '%{http_code}')"
printf 'admin_login=%s\n' "$LOGIN_CODE"

DASHBOARD_CODE="$(curl -ksS -b "$COOKIE_FILE" -o "$REMOTE_TMP.body" "$PROD_URL/admin/dashboard" -w '%{http_code} size=%{size_download}')"
printf 'dashboard=%s\n' "$DASHBOARD_CODE"

for asset in \
  /assets/instructions/example_voxtron_website.jpg \
  /assets/brand/voxtron-banner-removebg-preview.png \
  /assets/brand/voxtron-logo.png
do
  printf '%s=' "$asset"
  curl -ksS -o "$REMOTE_TMP.asset" "$PROD_URL$asset" -w '%{http_code} %{content_type} %{size_download}\n'
done

log "Deploy complete"
printf 'backup_dir=%s\n' "$BACKUP_DIR"
printf 'npm_ci=%s\n' "$([[ "$NEED_NPM_CI" == "1" ]] && printf run || printf skipped)"
