#!/usr/bin/env bash
# 用备份覆盖线上 prod.db（在腾讯云主机上执行）
# 用法:
#   ./scripts/restore-prod-db.sh
#   ./scripts/restore-prod-db.sh backups/prod_pre_test_20260719_002926.db
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:-backups/prod_pre_test_latest.db}"
if [[ ! -f "$SRC" ]]; then
  echo "找不到备份: $SRC" >&2
  exit 1
fi
echo "→ 将用 $SRC 覆盖线上 prod.db"
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml stop app
sudo docker cp "$SRC" hospital-crm-app-1:/app/data/prod.db
sudo docker compose -p hospital-crm -f docker-compose.tencent.yml start app
echo "→ 等待就绪..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/login >/dev/null; then
    echo "✓ 已回滚并就绪"
    exit 0
  fi
  sleep 2
done
echo "回滚后健康检查未通过" >&2
exit 1
