# Security

CalendarX is self-hosted open-source software (AGPL-3.0). This file is the
security contact and disclosure policy.

## Reporting a vulnerability

- **Private:** use GitHub's **Security → Report a vulnerability** on this repo
  to file a private disclosure (preferred — only maintainers see it).
- Do **not** open a public issue for a security bug.
- Include: affected version(s), a minimal reproduction, impact, and (if you
  have one) a suggested fix.

We aim to acknowledge reports within a few business days and to ship a fix and
release a patched tag promptly.

## What this project is (security posture)

- CalendarX is a **client**: it proxies CalDAV on your own server and never
  re-hosts your calendar data. Your calendar data stays on the CalDAV server
  you configure.
- The thin API (`apps/server`) stores per-account CalDAV connections
  (`connections.json`), accounts/sessions (`auth.json`), and UnifiedPush
  subscriptions (`push-subscriptions.json`) under `CALENDARX_DATA_DIR`
  (0600 files, atomic writes). The upstream CalDAV **password is stored** so the
  server can proxy authenticated requests; it is never returned to the browser.
- Sessions use an HttpOnly `cx_session` cookie (SHA-256 hashed at rest); set
  `CALENDARX_ALLOW_SIGNUP=false` to lock a private/single-user instance.

## Supported versions

The latest tagged release (`main` + the newest `v*` tag) is the supported
version. Older tags are not patched; upgrade to the latest release to get
fixes.

## Self-hosting responsibly

Run the web + API over TLS (a reverse proxy / Cloudflare tunnel in front of the
container is the supported pattern), keep the API port private if your web and
API co-locate, and back up `CALENDARX_DATA_DIR`.