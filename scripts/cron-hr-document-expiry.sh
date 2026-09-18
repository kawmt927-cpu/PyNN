#!/usr/bin/env bash
# 员工证件到期提醒（已过期 / 30 天内），推送给 HR 与管理员。
# 用法:
#   CRON_SECRET=xxx BASE_URL=http://localhost:3000 bash scripts/cron-hr-document-expiry.sh
#
# 建议 crontab（服务器 Asia/Shanghai）:
#   30 9 * * * CRON_SECRET=... BASE_URL=https://crm.pynntech.com bash /path/to/cron-hr-document-expiry.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

if [[ -z "$SECRET" ]]; then
  echo "缺少 CRON_SECRET 环境变量" >&2
  exit 1
fi

URL="${BASE_URL%/}/api/cron/hr-document-expiry"

echo "→ POST ${URL}"
curl -fsS -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  "$URL"
echo
