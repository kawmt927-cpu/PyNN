# Hooks for local Cursor IDE status

Install (macOS MVP):

1. `chmod +x hooks/companion-status.sh`
2. Merge [`hooks.json.example`](./hooks.json.example) into `~/.cursor/hooks.json`  
   Replace `ABSOLUTE_PATH` with the real directory containing this folder.
3. Restart Cursor / start a new Agent turn.
4. Confirm `~/.cursor/desktop-companion-status.json` updates (multi-agent `agents[]`).
5. Desktop companion lists each agent by **project/workspace name** + status; tray color follows aggregation rules (失败 → 待跟进 → 已完成 → 工作中).

Without hooks, the companion shows **未知（灰）**.

**Project names:** from hook payload `workspace_roots[0]` basename (`conversation_id` keys the row).

**待跟进:** approximated (completed stop aged without a new turn) — not an official WAITING_FOR_INPUT event. See Agent Store `docs/agent-status-aggregation.md`.

Details: Agent Store `docs/spending-and-local-status.md`, `docs/local-cursor-status-monitoring.md`.
