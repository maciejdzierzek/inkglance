# Changelog

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
- Access token with cookie, config in `~/.config/inkai/`.
- Pairing with a 4-digit code shown in a macOS notification - no token typing
  on e-ink keyboards. Port 80 supported for a short address.
- Log line when a browser tries `https://` on the plain-HTTP port.
