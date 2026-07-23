#!/bin/sh
set -e
if [ -d /app/data ]; then
  chown -R nextjs:nodejs /app/data 2>/dev/null || true
fi
mkdir -p /app/uploads/contracts
chown -R nextjs:nodejs /app/uploads 2>/dev/null || true
exec su-exec nextjs "$@"
