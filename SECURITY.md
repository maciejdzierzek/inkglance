# Security

inkai is meant for a trusted local network. It shows the names and folders of
your Claude Code sessions, and future versions will be able to approve actions
in them, so treat the access token like a password.

- Every page requires the token (link parameter, then an HttpOnly cookie).
- The settings form accepts display preferences only; network, binary path and
  token are file-only.
- Do not forward the port or put the panel on the public internet.

Report vulnerabilities privately through GitHub Security Advisories on this
repository.
