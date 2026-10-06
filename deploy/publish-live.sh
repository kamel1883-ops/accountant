#!/bin/bash
# سحب آخر master على الـ VPS دون لمس backend/.env (الملف متجاهَل من git)
set -euo pipefail
APP="${APP_DIR:-/var/www/jadara}"
cd "$APP"
test -f backend/.env
git fetch origin
git reset --hard origin/master
COMMIT="$(git rev-parse --short HEAD)"
cd "$APP/frontend"
npm ci
npm run build
cd "$APP/backend"
npm ci
npx prisma generate
npm run build
systemctl restart jadara-api
systemctl is-active jadara-api
echo "OK $COMMIT"
