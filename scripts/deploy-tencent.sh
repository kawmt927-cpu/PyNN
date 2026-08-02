#!/usr/bin/env bash
# 腾讯云共存部署（不影响 beproj 占用的 80 端口）
# 用法: ./scripts/deploy-tencent.sh user@host /path/to/key.pem
# 部署成功后仅清理 hospital-crm-* 未使用旧镜像与悬空层，不删其它项目的 tagged 镜像。

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
  --exclude .tmp
  --exclude backups
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
NEXTAUTH_URL="https://crm.pynntech.com"
PUBLIC_APP_URL="https://crm.pynntech.com"
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

# 同时构建 app（runner）与 migrate（builder），避免 migrate 镜像过旧漏跑迁移
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml build app migrate
# -T + 关闭 stdin：避免在 ssh bash -s heredoc 下吞掉后续 up/健康检查命令
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml --profile migrate run --rm -T migrate </dev/null
# latest 镜像更新后必须 force-recreate，否则仍跑旧容器
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml up -d --force-recreate --no-build app
echo "→ 容器已用最新镜像重建"

echo "→ 等待服务就绪..."
ready=0
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/login >/dev/null 2>&1; then
    echo "✓ CRM 已就绪: http://122.51.86.223:3001"
    ready=1
    break
  fi
  sleep 3
done

if [[ "$ready" -ne 1 ]]; then
  echo "构建完成，但健康检查未通过，请查看日志:"
  sudo docker compose -p hospital-crm logs --tail=80 app
  exit 1
fi

# 仅清理本项目（hospital-crm）产生的旧镜像，不影响 beproj 等其它容器/镜像
echo "→ 清理 CRM 旧镜像（不影响其他项目）..."
crm_reclaimed=0
while read -r img_id; do
  [[ -z "$img_id" ]] && continue
  # 仍被任意容器（含已停止）引用的镜像跳过
  if [[ -n "$(sudo docker ps -aq --filter "ancestor=${img_id}" 2>/dev/null)" ]]; then
    continue
  fi
  if sudo docker rmi -f "$img_id" >/dev/null 2>&1; then
    crm_reclaimed=$((crm_reclaimed + 1))
  fi
done < <(sudo docker images --format '{{.Repository}} {{.ID}}' | awk '$1 ~ /^hospital-crm-/ { print $2 }' | sort -u)

# 悬空镜像（rebuild 后失去 tag 的旧层）；带 tag 的其它项目镜像不会被删
dangling_out="$(sudo docker image prune -f 2>/dev/null || true)"
echo "  已删除未使用的 hospital-crm 镜像: ${crm_reclaimed} 个"
echo "  ${dangling_out:-dangling prune: done}"
df -h / | awk 'NR==1 || /\/$/ { print "  磁盘:", $0 }'
REMOTE
