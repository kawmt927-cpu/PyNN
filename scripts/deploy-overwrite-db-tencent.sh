#!/usr/bin/env bash
# 部署最新代码，并用本地 prisma/dev.db 全量覆盖线上 prod.db（先备份）
# 用法: ./scripts/deploy-overwrite-db-tencent.sh [user@host] [path/to/key.pem]

set -euo pipefail

REMOTE="${1:-ubuntu@122.51.86.223}"
KEY="${2:-}"
REMOTE_DIR="/home/ubuntu/hospital-crm-pm"
LOCAL_DB="$(cd "$(dirname "$0")/.." && pwd)/prisma/dev.db"

SSH=(ssh)
RSYNC=(rsync -avz --delete)
SCP=(scp)
if [[ -n "$KEY" ]]; then
  SSH=(ssh -i "$KEY")
  RSYNC=(rsync -avz --delete -e "ssh -i $KEY")
  SCP=(scp -i "$KEY")
fi

if [[ ! -f "$LOCAL_DB" ]]; then
  echo "本地数据库不存在: $LOCAL_DB" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXCLUDES=(
  --exclude node_modules
  --exclude .next
  --exclude .git
  --exclude dev.db
  --exclude '*.db-journal'
  --exclude .env
  --exclude .env.local
  --exclude .env.production
)

echo "→ 1/5 同步代码到 ${REMOTE}:${REMOTE_DIR}"
"${RSYNC[@]}" "${EXCLUDES[@]}" "$ROOT/" "${REMOTE}:${REMOTE_DIR}/"

echo "→ 2/5 上传本地数据库"
"${SCP[@]}" "$LOCAL_DB" "${REMOTE}:/tmp/prod.db.from.local"

echo "→ 3/5 远程：停服 → 备份并覆盖库 → 构建 → migrate → 启动"
"${SSH[@]}" "$REMOTE" "bash -s" <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/hospital-crm-pm
chmod +x scripts/docker-entrypoint.sh

if [[ ! -f .env.production ]]; then
  echo "缺少 .env.production，中止" >&2
  exit 1
fi

sudo docker compose -p hospital-crm -f docker-compose.tencent.yml stop app || true

STAMP=$(date +%Y%m%d%H%M%S)
sudo docker run --rm \
  -v hospital-crm_crm-data:/data \
  -v /tmp/prod.db.from.local:/tmp/prod.db.from.local:ro \
  alpine:3.20 \
  sh -c "
    set -e
    if [ -f /data/prod.db ]; then
      cp /data/prod.db /data/prod.db.bak.${STAMP}
      echo \"已备份 /data/prod.db.bak.${STAMP}\"
    fi
    cp /tmp/prod.db.from.local /data/prod.db
    chown 1001:1001 /data/prod.db
    ls -lah /data/prod.db*
  "

sudo docker compose -p hospital-crm -f docker-compose.tencent.yml build app
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml --profile migrate run --rm migrate
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml up -d app

echo "→ 等待服务就绪..."
for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:3001/login >/dev/null 2>&1; then
    echo "✓ CRM 已就绪: http://127.0.0.1:3001 与 https://crm.pynntech.com"
    exit 0
  fi
  sleep 3
done

echo "构建完成，但健康检查未通过，请查看日志:" >&2
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml logs --tail=80 app
exit 1
REMOTE

echo "→ 4/5 外网冒烟"
curl -sI "https://crm.pynntech.com/login" | head -5 || true

echo "→ 5/5 完成"
