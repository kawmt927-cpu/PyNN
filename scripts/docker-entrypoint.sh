#!/bin/sh
set -e
if [ -d /app/data ]; then
  chown -R nextjs:nodejs /app/data 2>/dev/null || true
fi
exec su-exec nextjs "$@"
