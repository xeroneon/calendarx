# Contributing to CalendarX

CalendarX is an open-source, self-hosted, CalDAV-generic calendar + tasks app
(web + PWA + Android). Thanks for considering a contribution. This guide gets
you from clone to a green test run.

## Layout

```
apps/web       TanStack Start web + PWA (calendar/tasks UI + CalDAV connection)
apps/server    thin Express API: per-account connection storage + CalDAV proxy
apps/mobile    Capacitor Android wrapper (from @calendarx/mobile-wrapper)
packages/      calendar (RFC 5545 engine) · caldav (client) · sdk · ui · types ·
               mobile-wrapper (Capacitor generator)
docs/          self-hoster / operator docs
```

## Prerequisites

- Node 22+
- pnpm 9 (or `corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- A CalDAV server to run against (Radicale, Nextcloud, Baikal, iCloud — any).

## Develop

```bash
pnpm install
pnpm dev      # web on :3102, server on :3101 (turbo)
pnpm check    # lint + typecheck + test + build across the monorepo
```

Open http://localhost:3102, create an account, then connect your CalDAV server
from the **Connection** screen (per-account; the server stores the connection,
never the browser).

### Running just one package

```bash
pnpm --filter @calendarx/server dev   # thin API only
pnpm --filter @calendarx/web dev      # web only
```

### Tests

Feature logic lives in pure helpers (`apps/web/src/lib/calendar.ts`) so it is
unit-testable. Run a package's suite with:

```bash
pnpm --filter @calendarx/web test
pnpm --filter @calendarx/server test
```

The server suite covers the account gate (signup/login/logout/me, 401 on
unauthed `/api/calendar` + `/api/connections`) and per-user connection
isolation. There is no jsdom/testing-library: component-interaction tests are
not feasible (SSR components need router/query/mutation providers), so keep
feature logic in the pure helpers.

## Android / APK

See [docs/build-apk.md](docs/build-apk.md) for building and signing the APK
yourself, and `apps/mobile/README.md` for the Capacitor wrapper layout.

## Pull requests

- Branch from `main`; open a PR against `main`.
- Give PRs a short, conventional title, e.g. `fix(web): honor all-day flags in
  week grid` — prefix by area (`web`, `server`, `engine`, `android`) and use
  `fix:` / `feat:` / `chore:` / `docs:` as appropriate.
- CI runs `pnpm check` (lint + typecheck + test + build) on every PR. Green is
  the bar for merge.
- Keep feature logic in pure, tested helpers; avoid re-inlining comparators or
  date math in components.

## Issues

- Bugs against the current `main` are welcome as GitHub issues. Reproduction
  steps (and, where relevant, the CalDAV server you hit) help a lot.
- Security vulnerabilities: see [SECURITY.md](SECURITY.md) — don't file them as
  public issues.

## License

AGPL-3.0 ([LICENSE](LICENSE)). By contributing you agree your changes are
released under it.