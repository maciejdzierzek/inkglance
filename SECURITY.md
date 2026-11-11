# Security

InkGlance is meant for a trusted local network. Anyone holding its access token
can approve commands in your Claude Code sessions and send messages to them, so
treat the token like a password.

## How the panel is protected

- Every page requires the token (link parameter, then an HttpOnly cookie).
  Devices get it by pairing with a 6-digit code: 10-minute lifetime, 5 attempts
  per code, at most 3 codes per hour, each announced on the computer.
- Only loopback and private network addresses may connect (RFC 1918, link-local,
  IPv6 ULA, 100.64.0.0/10 for VPNs such as Tailscale). The `Host` header must be
  an IP address, `localhost`, the computer's own name or an entry in
  `allowedHosts` - this blocks DNS rebinding from web pages.
- Forms that change anything carry the token in a hidden field (no cross-site
  requests); the settings form accepts display preferences only. Network,
  binary path and token are file-only.
- Hooks: only loopback clients with the token can submit permission requests,
  questions and reply slots. The token reaches curl through a header file, not
  the command line. The hook fails open to Claude Code's normal behavior and
  never approves on its own.
- Replies wake a session only with text sent from a paired device; the session
  stays usable on the computer the whole time.
- Installing an update (git pull) is allowed only from the computer itself.
- Plan limits from the usage endpoint read Claude Code's stored login read-only;
  it is sent only to api.anthropic.com, never logged, refreshed or written back.

## Known limits

- Plain HTTP: on a shared network others could read the traffic, including the
  token. Use a network you trust; never forward the port to the internet.
- All paired devices share one token. To revoke every device, delete `token`
  from `~/.config/inkglance/config.json` and restart; a new one is generated.

## Supported versions

Only the latest release receives fixes during the 0.x series.

## Reporting a vulnerability

Report privately through GitHub Security Advisories on this repository
("Report a vulnerability" on the Security tab). Expect a first answer within a
week.
