#!/usr/bin/env bash
# Cursor Hooks → ~/.cursor/desktop-companion-status.json for desktop-companion.
# Usage: companion-status.sh <eventName>   (JSON event on stdin)
#
# Writes a **multi-agent** status file. Each conversation_id is one agent row;
# display name = basename of the first workspace_roots entry (project/workspace).
# See hooks.json.example and docs/agent-status-aggregation.md
#
# 待跟进: hooks do not emit an official wait-for-user / mode-switch event.
# Companion approximates NeedsInput after a completed stop ages without a new turn.

set -euo pipefail

STATUS_FILE="${DESKTOP_COMPANION_STATUS_FILE:-$HOME/.cursor/desktop-companion-status.json}"
mkdir -p "$(dirname "$STATUS_FILE")"

EVENT_NAME="${1:-unknown}"
INPUT="$(cat || true)"

# Prefer python3 for JSON upsert (multi-agent). Fail soft to minimal single write.
if command -v python3 >/dev/null 2>&1; then
  EVENT_NAME="$EVENT_NAME" STATUS_FILE="$STATUS_FILE" INPUT="$INPUT" python3 - <<'PY'
import json, os, sys, time
from pathlib import Path

event = os.environ.get("EVENT_NAME", "unknown")
path = Path(os.environ["STATUS_FILE"])
raw = os.environ.get("INPUT", "") or ""

try:
    payload = json.loads(raw) if raw.strip() else {}
except Exception:
    payload = {}

def first(*keys, default=None):
    for k in keys:
        if k in payload and payload[k] not in (None, ""):
            return payload[k]
    return default

conversation_id = first("conversation_id", "conversationId", default="")
generation_id = first("generation_id", "generationId", default="")
roots = first("workspace_roots", "workspaceRoots", default=[]) or []
if isinstance(roots, str):
    roots = [roots]
workspace_root = roots[0] if roots else ""
project = Path(workspace_root).name if workspace_root else "本机 Cursor IDE"

stop_status = ""
status = "unknown"
detail = event

if event in ("beforeSubmitPrompt", "preToolUse", "postToolUse"):
    status = "working"
    detail = event
elif event == "stop":
    stop_status = str(first("status", default="") or "")
    low = stop_status.lower()
    if low in ("error", "aborted"):
        status = "failed"
    else:
        status = "done"
    detail = f"stop:{stop_status or 'completed'}"
else:
    detail = f"unhandled:{event}"

agent_id = conversation_id or (f"ws:{project}" if project else "local-ide")
updated = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

agent = {
    "id": agent_id,
    "name": project,
    "workspaceRoot": workspace_root or None,
    "status": status,
    "detail": detail,
    "source": "hooks",
    "updatedAt": updated,
    "stopStatus": stop_status or None,
    "conversationId": conversation_id or None,
    "generationId": generation_id or None,
}
# Drop nulls for cleaner file
agent = {k: v for k, v in agent.items() if v is not None}

doc = {"version": 1, "agents": []}
if path.exists():
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(doc, dict):
            doc = {"version": 1, "agents": []}
    except Exception:
        doc = {"version": 1, "agents": []}

agents = doc.get("agents")
if not isinstance(agents, list):
    agents = []
    # Migrate legacy single-agent shape into agents[]
    if doc.get("status"):
        legacy_id = doc.get("id") or "local-ide"
        agents.append({
            "id": legacy_id,
            "name": doc.get("name") or project,
            "workspaceRoot": doc.get("workspaceRoot"),
            "status": doc.get("status"),
            "detail": doc.get("detail"),
            "source": doc.get("source") or "hooks",
            "updatedAt": doc.get("updatedAt"),
            "stopStatus": doc.get("stopStatus"),
        })

replaced = False
for i, existing in enumerate(agents):
    if isinstance(existing, dict) and existing.get("id") == agent_id:
        agents[i] = agent
        replaced = True
        break
if not replaced:
    agents.append(agent)

# Soft prune: keep at most 20 most-recently updated agents
def sort_key(a):
    return str((a or {}).get("updatedAt") or "")

agents = sorted(
    [a for a in agents if isinstance(a, dict)],
    key=sort_key,
    reverse=True,
)[:20]

out = {
    "version": 1,
    "agents": agents,
    # Legacy single-agent mirror of the just-updated row (older readers).
    "status": status,
    "detail": detail,
    "source": "hooks",
    "updatedAt": updated,
    "stopStatus": stop_status or None,
    "id": agent_id,
    "name": project,
    "workspaceRoot": workspace_root or None,
}
out = {k: v for k, v in out.items() if v is not None}

tmp = path.with_suffix(path.suffix + f".tmp.{os.getpid()}")
tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
tmp.replace(path)
print("{}")
PY
  exit 0
fi

# Fallback without python3: single-agent overwrite (no multi-agent merge).
STATUS="unknown"
DETAIL="$EVENT_NAME"
STOP_STATUS=""
case "$EVENT_NAME" in
  beforeSubmitPrompt|preToolUse|postToolUse)
    STATUS="working"
    DETAIL="$EVENT_NAME"
    ;;
  stop)
    STATUS="done"
    DETAIL="stop:completed"
    ;;
  *)
    DETAIL="unhandled:$EVENT_NAME"
    ;;
esac
UPDATED="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TMP="${STATUS_FILE}.tmp.$$"
cat >"$TMP" <<EOF
{"version":1,"agents":[{"id":"local-ide","name":"本机 Cursor IDE","status":"$STATUS","detail":"$DETAIL","source":"hooks","updatedAt":"$UPDATED"}],"status":"$STATUS","detail":"$DETAIL","source":"hooks","updatedAt":"$UPDATED"}
EOF
mv "$TMP" "$STATUS_FILE"
echo '{}'
