#!/usr/bin/env bash
# 同步国务院法定节假日/调休到公司日历（数据源：NateScarlet/holiday-cn）。
# 用法:
#   CRON_SECRET=xxx BASE_URL=http://localhost:3000 bash scripts/cron-sync-company-calendar.sh
#   bash scripts/cron-sync-company-calendar.sh 2027          # 指定年份
#   bash scripts/cron-sync-company-calendar.sh 2027 force    # 强制重拉
#
# 建议 crontab（服务器 Asia/Shanghai，12 月中下旬每天试拉明年，成功后会 skip）:
#   0 10 10-31 12 * CRON_SECRET=... BASE_URL=https://crm.pynntech.com bash /path/to/cron-sync-company-calendar.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${CRON_SECRET:-}"
YEAR="${1:-}"
FORCE="${2:-}"

if [[ -z "$SECRET" ]]; then
  echo "缺少 CRON_SECRET 环境变量" >&2
  exit 1
fi

QS=""
if [[ -n "$YEAR" ]]; then
  QS="year=${YEAR}"
fi
if [[ "$FORCE" == "force" || "$FORCE" == "1" ]]; then
  QS="${QS:+${QS}&}force=1"
fi

URL="${BASE_URL%/}/api/cron/sync-company-calendar"
if [[ -n "$QS" ]]; then
  URL="${URL}?${QS}"
fi

echo "→ POST ${URL}"
curl -fsS -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  "$URL"
echo
