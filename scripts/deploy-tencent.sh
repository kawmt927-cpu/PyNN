#!/usr/bin/env bash
# 腾讯云共存部署（不影响 beproj 占用的 80 端口）
# 用法: ./scripts/deploy-tencent.sh user@host /path/to/key.pem

set -euo pipefail

REMOTE="${1:-ubuntu@122.51.86.223}"
KEY="${2:-}"
REMOTE_DIR="/home/ubuntu/hospital-crm-pm"
SSH=(ssh)
RSYNC=(rsync -avz --delete)
if [[ -n "$KEY" ]]; then
  SSH=(ssh -i "$KEY")
  RSYNC=(rsync -avz --delete -e "ssh -i $KEY")
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

echo "→ 同步代码到 ${REMOTE}:${REMOTE_DIR}"
"${RSYNC[@]}" "${EXCLUDES[@]}" "$ROOT/" "${REMOTE}:${REMOTE_DIR}/"

echo "→ 远程构建并启动（端口 3001）"
"${SSH[@]}" "$REMOTE" "bash -s" <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/hospital-crm-pm
chmod +x scripts/docker-entrypoint.sh

if [[ ! -f .env.production ]]; then
  SECRET=$(openssl rand -base64 32)
  cat > .env.production <<ENV
DATABASE_URL="file:/app/data/prod.db"
NEXTAUTH_SECRET="${SECRET}"
NEXTAUTH_URL="http://122.51.86.223:3001"
LLM_API_KEY=""
LLM_API_BASE="https://api.moonshot.cn/v1"
LLM_MODEL="kimi-k2.5"
WECOM_CORP_ID=""
WECOM_AGENT_ID=""
WECOM_SECRET=""
AMAP_WEB_SERVICE_KEY=""
NEXT_PUBLIC_AMAP_WEB_KEY=""
ENV
  echo "已生成 .env.production（请后续补 LLM / 企微 / 域名）"
fi

sudo docker compose -p hospital-crm -f docker-compose.tencent.yml build app
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml --profile migrate run --rm migrate
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml up -d app

echo "→ 等待服务就绪..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/login >/dev/null 2>&1; then
    echo "✓ CRM 已就绪: http://122.51.86.223:3001"
    exit 0
  fi
  sleep 3
done

echo "构建完成，但健康检查未通过，请查看日志:"
sudo docker compose -p hospital-crm logs --tail=80 app
REMOTE
