# Changelog

## Unreleased

## 0.1.0 - 2026-11-12

First public release.

**The panel**
- Claude Code sessions from the terminal, the VS Code extension and the Claude
  desktop app, listed by `claude agents --json` and enriched from transcripts
  (title, last prompt, current tool, model, context, output tokens, branch).
- Four state tiles (waiting for you, done · your turn, working, idle) and one
  board of cards, most urgent first, dealt into columns without gaps.
- **Your turn**: a session whose turn just ended gets a colored band with the
  time since it finished, a reader flash, a sound on the computer and `✓N`
  next to the menu-bar icon. *Later* puts it aside until its next turn ends.
- Plan limits (5 hours, week) with forecast and reset, from the Claude Code
  Usage extension's file, the status line, or - rarely - the usage endpoint;
  a limits screen with charts.
- State colors chosen on the reader (defaults measured on a Kaleido 3 color
  screen), a color test page, monochrome mode, 1-3 columns, landscape, text
  size, English and Polish. Works without JavaScript; no animation.

**Answering from the reader**
- *Allow* / *Deny* permission requests and answer Claude's multiple-choice
  questions - held only while you are away from the keyboard, by default.
- One-tap replies to finished sessions, in parallel with the computer
  (Stop hook with `asyncRewake`); editable reply buttons.
- Hooks fail open: when the panel is not running, Claude Code behaves as if
  InkGlance did not exist.

**Setup and safety**
- Claude Code plugin (hooks, `/inkglance:setup`, `/inkglance:doctor`) or manual
  install; macOS menu-bar app (Windows build as a preview) that owns and
  restarts the server; macOS background service.
- Pairing with a 6-digit code (at most 3 per hour), private networks only,
  Host header check, loopback-only hooks, token kept out of the process list.
- Daily update check (anonymous GitHub request, can be switched off).
- Demo mode with made-up sessions (`npm run demo`).
- Zero runtime dependencies; the app bundles the license notices of its Rust
  crates.
