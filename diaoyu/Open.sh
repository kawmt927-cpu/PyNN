#!/usr/bin/env bash
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
export DISPLAY="${DISPLAY:-:1}"
exec python3 "$HERE/app.py"
