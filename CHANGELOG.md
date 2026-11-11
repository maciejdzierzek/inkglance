# Changelog

## Unreleased

- One-tap replies from the reader to sessions that finished their turn, in
  parallel with the computer: Stop hook with `asyncRewake` + UserPromptSubmit
  hook. Templates configurable.
- Hooks are now a curl shell script (`src/hook.sh`, ~5 MB per waiting session);
  `src/hook.js` stays as a compatibility shim. Run `npm run hooks:install` again.

- Answer permission requests from the reader (Allow / Deny / On computer) via
  a Claude Code PermissionRequest hook: `npm run hooks:install`. Holds only
  when you are away (idle keyboard and mouse) by default, hands back when you
  return or after a timeout, fails open when the panel is down.

- "Where it runs" on cards: Terminal, VS Code, Claude app.
- Docs: data sources per environment (terminal, VS Code, desktop app), the
  Claude Code Usage extension, status line setup (`npm run statusline:print`),
  e-reader setup guide (`docs/e-readers.md`).

- Plan limits strip: 5-hour and weekly usage, reset time, forecast. Sources:
  Claude Code Usage extension file, status line snapshots, claude.ai usage
  endpoint (rare, Retry-After aware).
- `src/statusline.js`: optional Claude Code status line that also feeds limits.

- Alerts when a session starts waiting (or, optionally, finishes its turn):
  sound and/or notification on the Mac, screen flash on the reader, quiet hours.
  A background watcher checks sessions every 10 s; readers poll a tiny state
  endpoint and refresh at once when something changes.
- Service restart waits for the old instance (fixes "Bootstrap failed: 5").

- Refresh button in the top bar.
- `npm run service:install`: run the panel as a macOS background service.

- Orientation setting: automatic, or rotate the page left/right for a reader
  standing on its side whose browser stays portrait.

## 0.1.0 - unreleased

- Richer session cards from transcripts (best-effort): title, last prompt,
  current tool, model and effort, context size, output tokens, git branch.
- Choose which fields cards show; 1, 2 or 3 columns.
- Settings as big buttons (no typing); every tap saves.
- Compact top bar, fullscreen button, in-place refresh that keeps fullscreen.
- On-screen numeric keypad for the pairing code.

- Session panel for e-ink browsers: waiting / working / idle, collapsed old idle
  sessions, data from `claude agents --json`.
- Settings screen: language (English, Polish), refresh interval, card style,
  text size, color, path, diagnostics.
- Access token with cookie, config in `~/.config/inkglance/`.
- Pairing with a 4-digit code shown in a macOS notification - no token typing
  on e-ink keyboards. Port 80 supported for a short address.
- Log line when a browser tries `https://` on the plain-HTTP port.
