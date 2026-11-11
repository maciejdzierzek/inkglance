# inkai

A calm, always-on panel for your Claude Code sessions, made for an e-ink reader
on your desk.

inkai runs a tiny web server on your Mac. Any e-reader with a web browser on the
same Wi-Fi opens it and shows which sessions need you, which are working and
which are idle - across the terminal, the VS Code extension and the Claude
desktop app. No app to install on the reader, no cable.

Built and tested against a PocketBook Verse Pro Color (Kaleido 3), but it is
plain HTML and works in any browser.

> **Status: early (0.1).** Read-only session list and settings. Answering
> permission prompts and replying from the panel are planned, see
> [Roadmap](#roadmap).

## What it shows

- **Waiting for you** - sessions blocked on a permission prompt or your input,
  at the top, in color (or bold black on monochrome screens).
- **Working** and **Idle**, newest activity first.
- Idle sessions untouched for a long time are collapsed into one line, so a
  small screen keeps what matters.
- Per session (you choose which): title, last prompt, current tool, model and
  effort, context size, output tokens, git branch, last activity. These come
  from the session transcript on a best-effort basis: the format is internal
  to Claude Code, so a future version may hide some details, never the list.
- Fullscreen button; the page updates in place, so fullscreen survives refreshes.
- Plan limits (5-hour and weekly) with reset time and a forecast at the current
  pace. Sources, cheapest first: the [Claude Code Usage](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage)
  VS Code extension's local quota file (no network); snapshots from
  `src/statusline.js` if you use it as your Claude Code status line (terminal
  only - the VS Code extension does not run status line commands); and as a
  last resort the claude.ai usage endpoint with Claude Code's stored login,
  at most every 15 minutes and honoring Retry-After (it is strictly rate
  limited).
- Alerts when a session starts waiting: sound or notification on the Mac,
  screen flash on the reader, quiet hours.
- Optional diagnostics line (viewport, pixel ratio, browser) for tuning the
  layout on a new device.

## Requirements

- macOS or Linux, **Node.js 20+**
- **Claude Code** with the `claude agents --json` command (the panel reads
  session state from it - the documented interface, no log scraping)

## Quick start

```sh
git clone https://github.com/maciejdzierzek/inkai.git
cd inkai
npm start
```

The terminal prints the panel's address, such as `http://192.168.0.10:4747`.
Open it in the e-reader's browser - no long token to type: the page asks for a
4-digit code, which your computer shows in a notification (and in the
terminal). After pairing, bookmark the page.

**Shorter address on macOS:** set `"port": 80` in the config file and the
address becomes just `http://192.168.0.10` (macOS lets regular users listen on
port 80). This also helps browsers that try `https://` first: nothing listens
on 443, so they fall back to plain HTTP.

macOS may ask whether Node may accept incoming connections - allow it, the
reader connects over your local network.

## Run it in the background (macOS)

```sh
npm run service:install    # starts at login, restarts if it stops
npm run service:status
npm run service:logs       # the pairing code is printed here too
npm run service:uninstall
```

## Configuration

Settings live in `~/.config/inkai/config.json` (override with `INKAI_CONFIG`),
created on first start. Display preferences can also be changed on the panel's
**Settings** screen.

| Key | Default | Meaning |
|---|---|---|
| `language` | `en` | Interface language: `en`, `pl` |
| `refreshSeconds` | `60` | How often the page reloads (15-3600). E-ink does not need more |
| `columns` | `2` | Card columns: `1`, `2`, `3` |
| `orientation` | `auto` | `auto` follows the browser; `left` / `right` rotate the page for a reader on its side whose browser stays portrait |
| `cardFields` | see below | Which details cards show: `waitingFor`, `activity`, `lastPrompt`, `model`, `context`, `tokens`, `branch`, `times`, `path` |
| `hideIdleAfterHours` | `24` | Collapse idle sessions older than this (0 = never) |
| `fontScale` | `1` | Text size: `0.875` to `1.5` |
| `color` | `true` | Color for statuses; `false` for monochrome screens |
| `showDiagnostics` | `true` | Viewport and browser line in the footer |
| `host`, `port` | `0.0.0.0`, `4747` | Where the server listens (file only) |
| `claudeBin` | `claude` | Path to the Claude Code binary (file only) |
| `token` | generated | Access token (file only) |

Adding a language: copy `src/locales/en.json` to `src/locales/<code>.json`,
translate, and add the code to `LANGUAGES` in `src/config.js`. A test checks
that no key is missing.

## Security

The panel listens on your local network and shows project names. Every page
requires the access token, which a device gets once by pairing with a 4-digit
code (10-minute lifetime, 5 attempts, each new code is announced on the
computer). Network, binary path and token can only be changed
in the config file, never from the panel. Do not expose the port to the
internet. See [SECURITY.md](SECURITY.md).

## Roadmap

1. Session list and settings - **done**
2. Usage limits (5-hour and weekly) with a forecast - **done**; usage charts next
3. Allow / deny permission prompts from the panel (via Claude Code hooks)
4. Answer questions and send reply templates when a session finishes
5. Jump to the session's window on the computer

## Development

```sh
npm test          # unit tests
npm run check     # private-data guard, secret scan (gitleaks), tests
git config core.hooksPath .githooks   # once per clone
```

Zero runtime dependencies.

## License

MIT
