# Hooks for local Cursor IDE status

Install (macOS MVP):

1. `chmod +x hooks/companion-status.sh`
2. Merge [`hooks.json.example`](./hooks.json.example) into `~/.cursor/hooks.json`  
   Replace `ABSOLUTE_PATH` with the real directory containing this folder.
3. Restart Cursor / start a new Agent turn.
4. Confirm `~/.cursor/desktop-companion-status.json` updates.
5. Desktop companion tray colors follow that file (working / done / needs-input≈ / failed).

Without hooks, the companion shows **未知（灰）**.

Details: Agent Store `docs/spending-and-local-status.md`, `docs/local-cursor-status-monitoring.md`.
