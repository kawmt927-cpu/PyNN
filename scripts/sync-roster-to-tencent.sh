#!/usr/bin/env bash
# 将本地公司人员同步到腾讯云线上库（不清客户/合同等业务数据）
# 用法: ./scripts/sync-roster-to-tencent.sh [user@host] [/path/to/key.pem]
#
# 步骤：本机导出 JSON → rsync 到服务器 → 在 migrate 容器里对 prod.db upsert

set -euo pipefail

REMOTE="${1:-ubuntu@122.51.86.223}"
KEY="${2:-}"
REMOTE_DIR="/home/ubuntu/hospital-crm-pm"
SSH=(ssh)
RSYNC=(rsync -avz)
if [[ -n "$KEY" ]]; then
  SSH=(ssh -i "$KEY")
  RSYNC=(rsync -avz -e "ssh -i $KEY")
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ 本机导出人员…"
npx tsx prisma/export-roster.ts tmp/roster-sync.json

echo "→ 上传 roster-sync.json 与脚本到 ${REMOTE}…"
"${RSYNC[@]}" tmp/roster-sync.json "${REMOTE}:${REMOTE_DIR}/tmp/roster-sync.json"
"${RSYNC[@]}" prisma/export-roster.ts prisma/upsert-roster-from-json.ts \
  "${REMOTE}:${REMOTE_DIR}/prisma/"

echo "→ 线上 upsert（挂载 crm-data 卷）…"
"${SSH[@]}" "$REMOTE" "bash -s" <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/hospital-crm-pm
mkdir -p tmp
# 使用 builder 镜像跑 tsx（含完整 node_modules）
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml --profile migrate run --rm \
  -v "$(pwd)/tmp/roster-sync.json:/tmp/roster-sync.json:ro" \
  -v "$(pwd)/prisma/upsert-roster-from-json.ts:/app/prisma/upsert-roster-from-json.ts:ro" \
  --entrypoint sh \
  migrate \
  -c 'DATABASE_URL="file:/app/data/prod.db" npx tsx prisma/upsert-roster-from-json.ts /tmp/roster-sync.json --prune-demo'

echo "✓ 线上人员已同步"
REMOTE
