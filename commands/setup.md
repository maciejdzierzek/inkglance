---
description: Install or update the InkGlance panel on this computer and pair an e-reader
---

You are setting up **InkGlance** for the user: a small web server on this computer
that an e-reader on the same Wi-Fi opens to show Claude Code sessions, plan limits,
alerts, permission requests and reply buttons. Work step by step, run the commands
yourself, and explain each result in one or two plain sentences. Ask before
anything not listed here.

## 1. Check the basics

- `node --version` must be 20 or newer. If Node is missing, tell the user how to
  install it for their system and stop.
- `claude agents --json` must print a JSON array (it is how the panel lists sessions).
- Note the operating system. The background service and notifications are macOS
  only for now; on Linux the panel runs in a terminal (`npm start`).

## 2. Get the code into a stable place

The plugin's own folder changes with every plugin update, so the server runs from
a separate copy:

- If `~/.local/share/inkglance` exists: `git -C ~/.local/share/inkglance pull --ff-only`.
- Otherwise: `git clone https://github.com/maciejdzierzek/inkglance ~/.local/share/inkglance`.

Run the remaining commands in `~/.local/share/inkglance`.

## 3. Configure

Ask the user two questions, then set the answers:

- Interface language - `npm run config -- set language en` (or `pl`).
- Port - on macOS recommend `80`: the address becomes just the computer's IP, and
  readers that try `https://` first fall back to plain HTTP. `npm run config -- set port 80`.
  Otherwise keep the default `4747`.

Everything else can be changed later on the panel's Settings screen.

## 4. Start it

- macOS: `npm run service:install` (starts at login, restarts if it stops). Then
  `npm run service:status` should show `state = running`.
- Linux: tell the user to keep `npm start` running in a terminal.
- Check: `curl -s http://127.0.0.1:<port>/health` prints `ok`.

## 5. Hooks

This plugin already provides the hooks (permission requests, replies). Do **not**
run `npm run hooks:install` as well. If `npm run hooks:status` reports hooks in
settings.json from an earlier manual install, offer `npm run hooks:uninstall`
to avoid running them twice (the panel tolerates it, but once is cleaner).

## 6. Plan limits (optional)

Limits work when one of these is available:

- The user works in VS Code: suggest the *Claude Code Usage* extension
  (`code --install-extension growthjack.claude-code-usage`); InkGlance reads its
  local file, with no extra network requests.
- The user works in the terminal: offer to add the status line. Show the entry from
  `npm run statusline:print`; add it to `~/.claude/settings.json` only after the user
  agrees, and keep a backup copy of the file first.

Otherwise the panel asks claude.ai for limits itself, rarely (every 15 minutes at most).

## 7. Pair the e-reader

- `npm run config -- url` prints the address(es) to open.
- Tell the user: open it in the e-reader's browser, type the 4-digit code from the
  notification on this computer (also in `npm run service:logs`), then bookmark the page.
- Point them to `docs/e-readers.md` for keeping the reader awake and connected
  (screen lock off, longest power-off time, charger, fullscreen button, rotation).

## 8. Finish

Summarise in a few lines: the address, what the user will see, how to change
settings (on the reader), and that `/inkglance:doctor` checks everything later.
