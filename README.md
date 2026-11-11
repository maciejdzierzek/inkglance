# inkai

A calm, always-on panel for your Claude Code sessions, made for an e-ink reader
on your desk.

inkai runs a tiny web server on your computer. Any e-reader with a web browser
on the same Wi-Fi opens it and shows which sessions need you, which are working
and which are idle - whether they run in a terminal, the VS Code extension or
the Claude desktop app. Plan limits, alerts and per-session details included.
No app to install on the reader, no cable.

Built and tested on a PocketBook Verse Pro Color (Kaleido 3 color e-ink), but it
is plain HTML and works in any browser.

> **Status: early (0.1).** Watching sessions, limits, alerts and answering
> permission requests work. Replies and templates are next, see [Roadmap](#roadmap).

## What it shows

- **Waiting for you** at the top - sessions blocked on a permission prompt or
  your input - then **Working** and **Idle**, newest activity first. Idle
  sessions untouched for a long time collapse into one line.
- **Per session** (you choose which): title, where it runs (Terminal, VS Code,
  Claude app), what it waits for, current tool, last prompt, model and effort,
  context size, output tokens, git branch, last activity, folder.
- **Plan limits**: 5-hour and weekly usage, reset time, and a forecast at the
  current pace ("runs out ~21:10").
- **Alerts** when a session starts waiting (optionally also when it finishes):
  sound or notification on the computer, a screen flash on the reader, quiet
  hours.
- **Permission requests on the reader**: *Allow*, *Deny* or *On computer*, with
  the command or file being asked about (see below).
- Fullscreen, 1-3 columns, landscape, text size, colors or monochrome,
  English and Polish. Every setting is a big button - nothing to type on e-ink.

## Where the data comes from

| | Terminal (`claude`) | VS Code extension | Claude desktop app |
|---|---|---|---|
| Session list and status | yes | yes | yes |
| Details (title, tokens, ...) | yes | yes | yes |
| Plan limits via status line | yes | no | no |
| Plan limits via Claude Code Usage extension | yes* | yes* | yes* |
| Plan limits via claude.ai usage endpoint | fallback | fallback | fallback |
| Alerts | yes | yes | yes |

\* Limits are per account, not per session: one source covers every session.

- **Session list and status** come from `claude agents --json`, the documented
  way to list active Claude Code sessions. Verified with sessions from all three
  places.
- **Details** come from each session's transcript in `~/.claude/projects/`. The
  format is internal to Claude Code, so inkai reads it on a best-effort basis:
  if a future version changes it, some details disappear, the list stays.
- **Plan limits** (claude.ai Pro / Max subscriptions) - inkai uses the cheapest
  source available (setting *Limits source*, default *automatic*):
  1. **[Claude Code Usage](https://marketplace.visualstudio.com/items?itemName=growthjack.claude-code-usage)**
     ([source](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage), MIT), a VS Code
     extension that tracks your quota and keeps its observations in a local
     file. inkai reads that file: no network request of its own. Install it with
     `code --install-extension growthjack.claude-code-usage`; it needs no setup.
  2. **Status line** - Claude Code passes plan limits to status line commands.
     Run `npm run statusline:print` and add the printed `statusLine` entry to
     `~/.claude/settings.json`. Works in terminal sessions only: the VS Code
     extension and the desktop app do not run status line commands.
  3. **claude.ai usage endpoint**, with the login Claude Code stores (macOS
     Keychain or `~/.claude/.credentials.json`). Used only when nothing local is
     fresh, at most every 15 minutes, and it honors Retry-After - the endpoint is
     undocumented and strictly rate limited (we have seen a one-hour block). The
     token goes only to api.anthropic.com and is never stored or refreshed.

## Answering permission requests from the reader

```sh
npm run hooks:install     # adds a PermissionRequest hook to ~/.claude/settings.json (with a backup)
npm run hooks:status
npm run hooks:uninstall   # removes only inkai's entry (with a backup)
```

The hook works in the terminal, the VS Code extension and the desktop app.
One thing to know: while the panel holds a request, Claude Code does not show
its own permission dialog - it shows it only after the hook finishes. So by
default (*when I'm away*) inkai holds a request only when your keyboard and
mouse have been idle for a minute, and hands it back the moment you touch them.
At your desk you answer on the computer as usual; the reader just shows that a
session is waiting. Other modes: *always* and *never*.

Safety:

- The hook fails open: panel not running, no config, any error - it exits in
  milliseconds and Claude Code shows its normal dialog. It never approves
  anything by itself.
- *On computer* hands the request back; after a timeout (default 5 minutes) it
  is handed back automatically.
- Only Claude Code on the same computer can submit requests (loopback + token);
  only a paired reader can answer them.
- If you use Claude Code's auto mode, permission requests are rare; the panel
  still shows sessions waiting for your input.

## Requirements

- macOS (Linux works, minus notifications and the background service script)
- **Node.js 20+**
- **Claude Code** with the `claude agents` command

## Quick start

```sh
git clone https://github.com/maciejdzierzek/inkai.git
cd inkai
npm start
```

The terminal prints the panel's address, such as `http://192.168.0.10:4747`.
Open it in the e-reader's browser. Instead of a long token, the page shows a
keypad: type the 4-digit code from the notification on your computer (it is
also in the terminal). Then bookmark the page.

**Shorter address on macOS:** set `"port": 80` in the config file and the
address becomes `http://192.168.0.10`. This also helps browsers that try
`https://` first: nothing listens on 443, so they fall back to plain HTTP.

macOS may ask whether Node may accept incoming connections - allow it.

**Set up the reader** so it stays on and connected:
[docs/e-readers.md](docs/e-readers.md).

## Run it in the background (macOS)

```sh
npm run service:install    # starts at login, restarts if it stops
npm run service:status
npm run service:logs       # pairing codes are printed here too
npm run service:uninstall
```

Run `service:install` again after updating inkai or Node.

## Configuration

Settings live in `~/.config/inkai/config.json` (override with `INKAI_CONFIG`),
created on first start. Everything except the network, binary path and token
can also be changed on the panel's **Settings** screen.

| Key | Default | Meaning |
|---|---|---|
| `language` | `en` | `en`, `pl` |
| `refreshSeconds` | `60` | Full refresh interval (15-3600). Changes show sooner: the reader checks for them every 10 s |
| `columns` | `2` | `1`, `2`, `3` |
| `orientation` | `auto` | `auto` follows the browser; `left` / `right` draw the page sideways |
| `cardFields` | most | `where`, `waitingFor`, `activity`, `lastPrompt`, `model`, `context`, `tokens`, `branch`, `times`, `path` |
| `hideIdleAfterHours` | `24` | Collapse idle sessions older than this (0 = never) |
| `fontScale` | `1` | `0.875` to `1.5` |
| `color` | `true` | `false` for monochrome screens |
| `showDiagnostics` | `true` | Viewport and browser line in the footer, also reported to the log |
| `alertOn` | `["needsYou"]` | Add `finished` to be alerted when a session finishes its turn |
| `macSound`, `macSoundName` | `true`, `Glass` | Sound on the computer: `Glass`, `Ping`, `Submarine`, `Hero` |
| `macNotification` | `false` | System notification on the computer |
| `readerFlash` | `true` | Flash the reader's screen |
| `quietHours` | `off` | `21-8`, `22-7`, `23-7` |
| `showLimits` | `true` | Plan limits strip |
| `usageSource` | `auto` | `auto`, `extension`, `statusline`, `api`, `off` |
| `usageApiMinutes` | `15` | Minimum minutes between claude.ai usage requests |
| `approvals` | `away` | Answer permission requests on the reader: `off`, `away`, `always` |
| `awaySeconds` | `60` | Idle keyboard and mouse time that counts as away |
| `approvalTimeoutMinutes` | `5` | Hand a request back to the computer after this |
| `host`, `port` | `0.0.0.0`, `4747` | Where the server listens (file only) |
| `claudeBin` | `claude` | Path to the Claude Code binary (file only) |
| `token` | generated | Access token (file only) |

Adding a language: copy `src/locales/en.json` to `src/locales/<code>.json`,
translate, and add the code to `LANGUAGES` in `src/config.js`. A test checks
that no key is missing.

## Security

The panel listens on your local network and shows project names and prompts.
Every page requires the access token, which a device gets once by pairing with
a 4-digit code (10-minute lifetime, 5 attempts, each new code is announced on
the computer). Network, binary path and token can only be changed in the config
file. Do not expose the port to the internet. See [SECURITY.md](SECURITY.md).

## Roadmap

1. Session list, settings, alerts, plan limits - **done**
2. Allow / deny permission requests from the reader - **done**
3. Usage charts from the limits history
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
