# Hooks for local Cursor IDE status

Install (macOS MVP):

1. `chmod +x hooks/companion-status.sh`
2. Merge [`hooks.json.example`](./hooks.json.example) into `~/.cursor/hooks.json`  
   Replace `ABSOLUTE_PATH` with the real directory containing this folder.
3. Restart Cursor / start a new Agent turn.
4. Confirm `~/.cursor/desktop-companion-status.json` updates (multi-agent `agents[]`).
5. Desktop companion lists each agent by **display name** + status; tray color follows aggregation rules (失败 → 待跟进 → 已完成 → 工作中).

Without hooks, the companion shows **未知（灰）**.

**Display names** (priority): explicit agent/composer/conversation title from hook JSON if present → `workspace_roots[0]` basename → short `conversation_id` (`Agent · abcdef`). Duplicate labels with different `conversation_id`s get ` · <suffix>`. Official Hooks schema does **not** currently document agent sidebar titles; the script still forwards any of those name keys if Cursor starts sending them.

**待跟进:** approximated (completed stop aged without a new turn) — not an official WAITING_FOR_INPUT event. See Agent Store `docs/agent-status-aggregation.md`.

Details: Agent Store `docs/spending-and-local-status.md`, `docs/local-cursor-status-monitoring.md`.

### After updating this repo

Re-copy `companion-status.sh` into `~/.cursor/hooks/` (or whatever path `hooks.json` points to), `chmod +x`, then **restart Cursor** (or start a new Agent turn) so new events rewrite `desktop-companion-status.json` with unique names. Rebuild/restart the companion app to pick up Rust disambiguation for any already-colliding status file.
