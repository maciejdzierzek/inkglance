---
description: Check that InkGlance works - service, port, sessions, hooks, limits, reader
---

Check the InkGlance installation and report each item as OK or a problem with a
one-line fix. Do not change anything without asking. Work in `~/.local/share/inkglance`
if it exists, otherwise in the folder where InkGlance was cloned.

1. **Service** (macOS): `npm run service:status` - running? If not, show the last
   lines of `~/Library/Logs/inkglance.log`.
2. **Panel**: read the port with `npm run config`, then `curl -s http://127.0.0.1:<port>/health`.
3. **Sessions**: `claude agents --json` - how many sessions; does the panel see the same?
4. **Hooks**: are they active from the plugin, from settings.json (`npm run hooks:status`),
   or both? Both is tolerated; suggest keeping one.
5. **Limits**: is the Claude Code Usage extension file present
   (`~/Library/Application Support/Code/User/globalStorage/growthjack.claude-code-usage/quota-observations-v2.json`
   on macOS), are there status line snapshots in `~/.config/inkglance/status/`?
6. **Reader**: the last `DIAG` line in the log shows the reader's screen size and
   browser and whether it keeps the cookie; the last requests from its IP show
   whether it still refreshes.

End with a short summary and the single most useful next step.
