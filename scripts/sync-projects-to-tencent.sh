#!/usr/bin/env bash
# 将本地项目 + 排班同步到腾讯云（先删线上全部项目再导入）
# 做法：下载 prod.db → 本机导入 → 回传覆盖
# 用法: ./scripts/sync-projects-to-tencent.sh [user@host] [/path/to/key.pem]
#
# 注意：若刚跑过 sync-roster，可直接对同一份 tmp/prod-work.db 导入后一并回传；
# 本脚本默认独立下载→导入→回传。

set -euo pipefail

REMOTE="${1:-ubuntu@122.51.86.223}"
KEY="${2:-}"
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

echo "→ 本机导出项目/排班…"
npx tsx scripts/export-projects-schedule.ts tmp/projects-schedule-sync.json

echo "→ 下载线上库…"
"${SSH[@]}" "$REMOTE" "sudo cp /var/lib/docker/volumes/hospital-crm_crm-data/_data/prod.db /tmp/prod-work.db && sudo chmod 644 /tmp/prod-work.db"
"${SCP[@]}" "${REMOTE}:/tmp/prod-work.db" "$WORK_DB"

echo "→ 本机导入（清空全部项目）…"
DATABASE_URL="$DB_URL" npx prisma migrate deploy
DATABASE_URL="$DB_URL" npx tsx scripts/import-projects-schedule.ts tmp/projects-schedule-sync.json

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
  sh -c "cp /data/prod.db /data/prod.db.bak.projects_${STAMP}; cp /tmp/prod.db.from.local /data/prod.db; chown 1001:1001 /data/prod.db"
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml up -d app
echo "✓ 线上项目/排班已同步"
REMOTE
