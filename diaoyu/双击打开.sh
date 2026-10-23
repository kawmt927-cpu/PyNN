#!/usr/bin/env bash
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
export DISPLAY="${DISPLAY:-:1}"
if ! command -v python3 >/dev/null 2>&1; then
  echo "找不到 python3" >&2
  exit 1
fi
exec python3 "$HERE/app.py"
