#!/bin/sh
# Prints the "statusLine" entry for ~/.claude/settings.json with absolute paths
# for this checkout. Add it by hand (or merge with your own status line):
# Claude Code then passes model, context and plan limits to InkGlance.
# Works in terminal sessions; the VS Code extension and the desktop app do not
# run status line commands (measured with Claude Code 2.1.3xx).
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
printf '"statusLine": { "type": "command", "command": "%s %s/src/statusline.js" }\n' "$NODE" "$REPO"
