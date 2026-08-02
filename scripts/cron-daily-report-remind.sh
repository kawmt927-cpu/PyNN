#!/usr/bin/env bash
# 触发日报催交 / 迟交锁定任务。
# 用法:
#   CRON_SECRET=xxx BASE_URL=http://localhost:3000 bash scripts/cron-daily-report-remind.sh 20
#   bash scripts/cron-daily-report-remind.sh 21
#   bash scripts/cron-daily-report-remind.sh late
#   bash scripts/cron-daily-report-remind.sh auto
#
# 建议 crontab（服务器 Asia/Shanghai）:
#   0 20 * * * CRON_SECRET=... BASE_URL=https://crm.pynntech.com bash /path/to/cron-daily-report-remind.sh 20
#   0 21 * * * ... 21
#   5 22 * * * ... late

set -euo pipefail

SLOT="${1:-auto}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"

if [[ -z "$SECRET" ]]; then
  echo "缺少 CRON_SECRET 环境变量" >&2
  exit 1
fi

URL="${BASE_URL%/}/api/cron/daily-report-reminders?slot=${SLOT}"
echo "→ POST ${URL}"
curl -fsS -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  "$URL"
echo
