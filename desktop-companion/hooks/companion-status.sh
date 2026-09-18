#!/usr/bin/env bash
# Cursor Hooks → ~/.cursor/desktop-companion-status.json for desktop-companion.
# Usage: companion-status.sh <eventName>   (JSON event on stdin)
#
# Writes a **multi-agent** status file. Each conversation_id is one agent row.
# Display name priority (see docs/agent-status-aggregation.md):
#   1) agent/composer/conversation display name if present in hook JSON
#   2) basename of workspace_roots[0]
#   3) short conversation_id suffix
# Duplicate labels with different conversation_ids are disambiguated with · <suffix>.
#
# 待跟进: hooks do not emit an official wait-for-user / mode-switch event.
# Companion approximates NeedsInput after a completed stop ages without a new turn.
#
# Never log secrets (tokens, cookies, full prompts). Payload keys may be noted
# in nameSource for debugging; values for name fields only when used as labels.

set -euo pipefail

STATUS_FILE="${DESKTOP_COMPANION_STATUS_FILE:-$HOME/.cursor/desktop-companion-status.json}"
mkdir -p "$(dirname "$STATUS_FILE")"

EVENT_NAME="${1:-unknown}"
INPUT="$(cat || true)"

# Prefer python3 for JSON upsert (multi-agent). Fail soft to minimal single write.
if command -v python3 >/dev/null 2>&1; then
  EVENT_NAME="$EVENT_NAME" STATUS_FILE="$STATUS_FILE" INPUT="$INPUT" python3 - <<'PY'
import json, os, re, time
from collections import Counter
from pathlib import Path

event = os.environ.get("EVENT_NAME", "unknown")
path = Path(os.environ["STATUS_FILE"])
raw = os.environ.get("INPUT", "") or ""

try:
    payload = json.loads(raw) if raw.strip() else {}
except Exception:
    payload = {}

if not isinstance(payload, dict):
    payload = {}

def first(*keys, default=None):
    for k in keys:
        if k in payload and payload[k] not in (None, ""):
            return payload[k]
    return default

def short_id(cid: str) -> str:
    if not cid:
        return ""
    alnum = re.sub(r"[^0-9A-Za-z]", "", cid)
    if len(alnum) >= 6:
        return alnum[-6:]
    return alnum or cid[:8]

# Undocumented / forward-looking name keys. Official Cursor Hooks common schema
# (docs, 2026) documents conversation_id, generation_id, model, workspace_roots,
# transcript_path, etc. — NOT an agent/composer display title. We still probe
# these so future Cursor versions or undocumented fields light up immediately.
EXPLICIT_NAME_KEYS = (
    "agent_name",
    "agentName",
    "composer_name",
    "composerName",
    "conversation_title",
    "conversationTitle",
    "conversation_name",
    "conversationName",
    "display_name",
    "displayName",
    "title",
    "project_name",
    "projectName",
)

def pick_explicit_name(data: dict):
    for k in EXPLICIT_NAME_KEYS:
        v = data.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip(), k
    for nest_key in ("composer", "agent", "conversation", "project"):
        nest = data.get(nest_key)
        if not isinstance(nest, dict):
            continue
        for k in ("name", "title", "display_name", "displayName"):
            v = nest.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip(), f"{nest_key}.{k}"
    return None, None

def resolve_display_name(conversation_id: str, workspace_root: str):
    explicit, src = pick_explicit_name(payload)
    if explicit:
        return explicit, f"explicit:{src}"
    if workspace_root:
        base = Path(workspace_root).name
        if base:
            return base, "workspace_basename"
    suf = short_id(conversation_id)
    if suf:
        return f"Agent · {suf}", "conversation_id"
    return "本机 Cursor IDE", "fallback"

def disambiguate_agent_names(agents: list) -> None:
    """Ensure distinct conversation rows never share an identical label."""
    counts = Counter()
    for a in agents:
        if isinstance(a, dict):
            counts[str(a.get("name") or "")] += 1
    for a in agents:
        if not isinstance(a, dict):
            continue
        name = str(a.get("name") or "")
        if counts.get(name, 0) <= 1:
            continue
        cid = str(a.get("conversationId") or a.get("id") or "")
        suf = short_id(cid)
        if not suf:
            continue
        if name.endswith(f" · {suf}"):
            continue
        a["name"] = f"{name} · {suf}" if name else f"Agent · {suf}"
        a["nameSource"] = f"{a.get('nameSource') or 'unknown'}+disambiguate"

conversation_id = str(first("conversation_id", "conversationId", default="") or "")
generation_id = str(first("generation_id", "generationId", default="") or "")
roots = first("workspace_roots", "workspaceRoots", default=[]) or []
if isinstance(roots, str):
    roots = [roots]
workspace_root = roots[0] if roots else ""
project, name_source = resolve_display_name(conversation_id, workspace_root)

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

agent_id = conversation_id or (f"ws:{Path(workspace_root).name}" if workspace_root else "local-ide")
updated = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

agent = {
    "id": agent_id,
    "name": project,
    "nameSource": name_source,
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
            "conversationId": doc.get("conversationId"),
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

disambiguate_agent_names(agents)

# Refresh `project` from the row we just wrote (may have · suffix).
for a in agents:
    if isinstance(a, dict) and a.get("id") == agent_id:
        project = a.get("name") or project
        name_source = a.get("nameSource") or name_source
        break

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
    "nameSource": name_source,
    "workspaceRoot": workspace_root or None,
    "conversationId": conversation_id or None,
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
