# Security

inkai is meant for a trusted local network. It shows the names and folders of
your Claude Code sessions, and future versions will be able to approve actions
in them, so treat the access token like a password.

- Every page requires the token (link parameter, then an HttpOnly cookie).
- The settings form accepts display preferences only; network, binary path and
  token are file-only.
- Limits from the claude.ai usage endpoint read Claude Code's stored login
  (macOS Keychain or `~/.claude/.credentials.json`) read-only. The token is sent
  only to api.anthropic.com, never logged, never refreshed or written back.
- Replies: the Stop hook wakes a session only with text sent from a paired
  device; the session stays usable on the computer the whole time.
- Permission requests: only loopback clients with the token can submit them
  (the Claude Code hook); only paired devices can answer. The hook fails open to
  Claude Code's normal dialog and never approves on its own.
- Do not forward the port or put the panel on the public internet.

Report vulnerabilities privately through GitHub Security Advisories on this
repository.
