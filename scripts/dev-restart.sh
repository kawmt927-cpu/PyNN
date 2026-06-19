#!/usr/bin/env bash
# 停止旧 dev 进程 → 重新生成 Prisma → 清 .next → 类型检查 → 启动 dev → 健康检查
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKGROUND=false
SKIP_CHECK=false

for arg in "$@"; do
  case "$arg" in
    --background|-b) BACKGROUND=true ;;
    --skip-check) SKIP_CHECK=true ;;
  esac
done

echo "→ 停止 3000–3003 端口上的 dev 进程..."
for port in 3000 3001 3002 3003; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  释放端口 $port (pid: $pids)"
    kill $pids 2>/dev/null || kill -9 $pids 2>/dev/null || true
  fi
done
sleep 1

echo "→ 重新生成 Prisma Client..."
npx prisma generate

echo "→ 清除 .next 缓存..."
rm -rf .next

if [ "$SKIP_CHECK" = false ]; then
  echo "→ 类型检查..."
  npx tsc --noEmit
fi

start_dev() {
  npm run dev
}

if [ "$BACKGROUND" = true ]; then
  echo "→ 后台启动 dev 服务器..."
  nohup npm run dev > /tmp/hospital-crm-pm-dev.log 2>&1 &
  DEV_PID=$!
  echo "  pid: $DEV_PID, 日志: /tmp/hospital-crm-pm-dev.log"

  echo "→ 等待 http://localhost:3000 就绪..."
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login 2>/dev/null || echo "000")
    if [ "$code" = "200" ]; then
      echo "✓ 开发服务器已就绪: http://localhost:3000 (login $code)"
      exit 0
    fi
    sleep 1
  done
  echo "✗ 30 秒内服务器未就绪，查看日志: tail -f /tmp/hospital-crm-pm-dev.log"
  exit 1
else
  echo "→ 启动 dev 服务器 (前台)..."
  start_dev
fi
