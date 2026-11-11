# Changelog

## Unreleased

- New panel layout: four state tiles with icons and big numbers; plan limits
  on one row; one board of cards, most urgent first, dealt into columns without
  gaps (permission requests and questions included); every card has a colored
  state band with icon and time; idle sessions take two lines; numbers as
  84k / 12.3k with icons.
- Default reply buttons no longer repeat themselves: "Yes, go ahead", "Plan
  first, no changes yet", "Sum up in three sentences", "Run the tests",
  "Commit".
- Menu-bar app restarts the server if it exits (crash, or a restart after an
  update installed from the panel); opens only GitHub release links.
- Bounded memory and disk for long runs (token activity, status-line
  snapshots older than 7 days are deleted); one activity scan at a time.
- Windows: idle time is read in the background, so permission requests are not
  delayed by PowerShell start-up.
- Hardening: Referrer-Policy, X-Frame-Options and nosniff headers; diagnostics
  in the log are sanitized; logs with pairing codes are owner-only; release
  links other than GitHub pages are ignored; Windows paths split correctly.
- CONTRIBUTING, Code of Conduct, issue templates (bug, e-reader report), PR
  template, FAQ; demo flags `--mono` and `--scale`.

- Security: pairing codes have 6 digits and at most 3 are issued per hour
  (guessing a code from the network is no longer practical); only loopback and
  private networks may connect; the Host header must name this computer
  (blocks DNS rebinding; extra names via `allowedHosts`); Windows notification
  text goes through environment variables (typographic quotes could break out
  of the PowerShell string); the hook token reaches curl through a header file,
  not the process list; `hook.env` is always 0600; the prompt hook waits 1 s.
- Demo mode: `npm run demo` serves made-up sessions, a permission request, a
  question and limits on port 4800 - for trying InkGlance and for screenshots.
- README rewritten: requirements, install (plugin or manual - not both),
  pairing, privacy, troubleshooting, uninstall, honest update paths;
  screenshots from the demo. SECURITY.md updated.

- **Your turn**: sessions whose turn ended (read from the transcript: Claude
  stopped without a tool call and you have not answered) get their own section,
  a full-width band with the time since they finished, a reader flash, the
  computer sound (on by default) and `✓N` next to the menu-bar icon. *Later*
  puts one aside until its next turn ends. Setting `finishedHours` (Settings →
  Cards).
- Settings tabs look like tabs (raised active tab joined to its panel).
- Fixed: overlapping reads of one transcript could double counters or skip
  lines; one listing and one read per file at a time. Characters split across
  read chunks stay whole.
- Fixed: `tray:install` left the previous app's server running on the port.

- Update checks: daily look at the latest GitHub release, badge in the panel,
  Settings → About (version, install method, what's new, check now, install
  for git checkouts - from the computer only), update item in the tray menu.

- Windows and Linux (preview): notifications, sounds and idle detection go
  through `src/platform.js` with per-platform commands; hooks have a portable
  Node version (`src/hook.js`) used on Windows; the tray app uses the colour
  icon outside macOS. CI builds the app for macOS and Windows.

- Menu-bar app for macOS (Tauri 2, `npm run tray:install`): waiting count next
  to the icon, status, reader address, panel / settings / limits windows,
  restart, log, open at login, quit. Owns the server (bundled copy).
- `/state` also reports session counts.

- Icon: an eye whose pupil is an e-reader screen with a red dot. Color tile,
  browser favicon, plugin icon, monochrome menu-bar template.

- Settings in tabs (Display, Cards, Replies, Alerts, Limits); each tab saves
  only its own options.
- Edit reply buttons on the reader: change, reorder, remove, add, defaults.

- Limits screen with charts: this week + projection, output tokens per hour
  (24 h, from transcripts), weekly peaks. History from the Claude Code Usage
  extension, or recorded by the panel for other sources.
- A limits window that has reset since the last reading shows "new window"
  instead of the old number.

- Claude's multiple-choice questions (AskUserQuestion) on the reader: options
  as buttons, the answer fills the tool's `answers` field - no dialog, a normal
  answer for Claude. Same "when away" rule as permission requests.

- Claude Code plugin in the repository: hooks without editing settings, plus
  `/inkglance:setup` (guided install and pairing) and `/inkglance:doctor`.
- `npm run config` to read and change settings from the terminal.
- Duplicate permission requests (plugin + settings hooks) join one card.
- Renamed to InkGlance (was the working name "inkai"); old config, cookie,
  service and hooks are migrated.

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
