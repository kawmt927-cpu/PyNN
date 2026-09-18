#!/usr/bin/env bash
# 将本地公司人员（含月成本/工资条）同步到腾讯云线上库（不清客户/合同）
# 做法：下载 prod.db → 本机 upsert → 回传覆盖（避免 migrate 镜像重跑 next build）
# 用法: ./scripts/sync-roster-to-tencent.sh [user@host] [/path/to/key.pem]

set -euo pipefail

REMOTE="${1:-ubuntu@122.51.86.223}"
KEY="${2:-}"
REMOTE_DIR="/home/ubuntu/hospital-crm-pm"
SSH=(ssh)
SCP=(scp)
if [[ -n "$KEY" ]]; then
  SSH=(ssh -i "$KEY")
  SCP=(scp -i "$KEY")
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p tmp
WORK_DB="$ROOT/tmp/prod-work.db"
DB_URL="file:${WORK_DB}"

echo "→ 本机导出人员…"
npx tsx prisma/export-roster.ts tmp/roster-sync.json

echo "→ 下载线上库…"
"${SSH[@]}" "$REMOTE" "sudo cp /var/lib/docker/volumes/hospital-crm_crm-data/_data/prod.db /tmp/prod-work.db && sudo chmod 644 /tmp/prod-work.db"
"${SCP[@]}" "${REMOTE}:/tmp/prod-work.db" "$WORK_DB"

echo "→ 本机 upsert…"
DATABASE_URL="$DB_URL" npx prisma migrate deploy
DATABASE_URL="$DB_URL" npx tsx prisma/upsert-roster-from-json.ts tmp/roster-sync.json --prune-demo

echo "→ 回传并替换线上库…"
"${SCP[@]}" "$WORK_DB" "${REMOTE}:/tmp/prod.db.from.local"
"${SSH[@]}" "$REMOTE" "bash -s" <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/hospital-crm-pm
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml stop app
STAMP=$(date +%Y%m%d%H%M%S)
sudo docker run --rm \
  -v hospital-crm_crm-data:/data \
  -v /tmp/prod.db.from.local:/tmp/prod.db.from.local:ro \
  alpine:3.20 \
  sh -c "cp /data/prod.db /data/prod.db.bak.roster_${STAMP}; cp /tmp/prod.db.from.local /data/prod.db; chown 1001:1001 /data/prod.db"
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml up -d app
echo "✓ 线上人员/成本已同步"
REMOTE
