#!/usr/bin/env bash
# Cursor Hooks → ~/.cursor/desktop-companion-status.json for desktop-companion.
# Usage: companion-status.sh <eventName>   (JSON event on stdin)
# See hooks.json.example and docs/spending-and-local-status.md

set -euo pipefail

STATUS_FILE="${DESKTOP_COMPANION_STATUS_FILE:-$HOME/.cursor/desktop-companion-status.json}"
mkdir -p "$(dirname "$STATUS_FILE")"

EVENT_NAME="${1:-unknown}"
INPUT="$(cat || true)"

extract_status_field() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r '.status // empty' 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  v=d.get("status")
  print(v if v is not None else "")
except Exception:
  pass' 2>/dev/null || true
  else
    echo ""
  fi
}

STATUS="unknown"
DETAIL="$EVENT_NAME"
STOP_STATUS=""

case "$EVENT_NAME" in
  beforeSubmitPrompt|preToolUse|postToolUse)
    STATUS="working"
    DETAIL="$EVENT_NAME"
    ;;
  stop)
    STOP_STATUS="$(extract_status_field)"
    case "$(printf '%s' "$STOP_STATUS" | tr '[:upper:]' '[:lower:]')" in
      error|aborted)
        STATUS="failed"
        ;;
      *)
        STATUS="done"
        ;;
    esac
    DETAIL="stop:${STOP_STATUS:-completed}"
    ;;
  *)
    STATUS="unknown"
    DETAIL="unhandled:$EVENT_NAME"
    ;;
esac

UPDATED="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TMP="${STATUS_FILE}.tmp.$$"
# Escape detail for JSON (minimal)
DETAIL_ESC=$(printf '%s' "$DETAIL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$DETAIL")
STOP_ESC=$(printf '%s' "$STOP_STATUS" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$STOP_STATUS")

cat >"$TMP" <<EOF
{"status":"$STATUS","detail":${DETAIL_ESC},"source":"hooks","updatedAt":"$UPDATED","stopStatus":${STOP_ESC}}
EOF
mv "$TMP" "$STATUS_FILE"

# Hooks expect JSON on stdout for some events; empty object is safe.
echo '{}'
