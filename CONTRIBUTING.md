# Contributing

Thanks for helping! InkGlance is small on purpose - please keep it that way.

## Ground rules

- **Zero runtime dependencies.** Node's standard library only; the page is
  server-rendered HTML and plain CSS that must work without JavaScript.
- **E-ink first.** No animation, high contrast, big tap targets (at least about
  2.2 em), nothing that needs dragging. Check changes at the reader's size:
  `npm run demo`, then open it in a browser at 572×663 (or your reader).
- **Made-up data only** in screenshots, tests and examples. Never commit real
  session titles, project names or paths - the demo exists for this.
- **Claude Code internals are best-effort.** Transcripts are an internal format:
  every field optional, a bad line skipped, the session list must keep working.
- Hooks must **fail open** within a second when the panel is down.

## Setup

```sh
git clone https://github.com/maciejdzierzek/inkglance.git
cd inkglance
git config core.hooksPath .githooks   # private-data guard + secret scan on commit
npm test
npm run demo                          # made-up sessions on port 4800
```

Never test hooks against your own running panel: a fake permission request
would show up on your reader. Use a separate config:
`INKGLANCE_CONFIG=/tmp/x.json` with another `port`, and
`INKGLANCE_HOOK_ENV=/tmp/hook.env` for the hook.

## Before a pull request

- `npm run check` passes (guard, gitleaks, tests).
- New behavior has a unit test; user-visible changes have a line in
  `CHANGELOG.md` under *Unreleased*.
- Texts exist in every language in `src/locales/` (a test checks the keys).

## Ideas that fit

- Guides and measurements for other e-readers (`docs/e-readers.md`): model,
  browser engine, viewport, what works.
- Translations: copy `src/locales/en.json`, translate, add the code to
  `LANGUAGES` in `src/config.js`.
- Windows and Linux reports - both are in preview.
