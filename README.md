# CalendarX

Your own **self-hosted, CalDAV-generic calendar + tasks app** — web + PWA +
Android, distributed open-source.

CalendarX does **not** re-host your data. It is a **CalDAV-generic client**: it
connects to any standard CalDAV server — Nextcloud Calendar, Radicale, Baikal,
iCloud — and puts that data behind a fast, opinionated, Linear-grade UI. Our own
deployment keeps **Nextcloud Calendar** as the upstream backend.

Seeded from the proven Xeroneon Cloud Phase 2 module (XER-78 RFC 5545 engine +
XER-79 calendar/tasks UI), extracted and rebranded here rather than rebuilt from
scratch.

## Stack

- **pnpm + Turborepo** monorepo, TypeScript end-to-end
- **TanStack Start** (Router + Query) web app + PWA
- **Capacitor** hybrid wrapper → signed **Android APK** → Obtainium
- RFC 5545 engine (`@calendax/calendar`) + **CalDAV client** (`@calendax/caldav`)

## Layout

```
apps/web       TanStack Start web + PWA (calendar/tasks UI + CalDAV connection)
apps/server    thin API: stores the CalDAV connection + proxies to the upstream
apps/mobile    Capacitor Android wrapper (from @calendax/mobile-wrapper)
packages/      calendar (RFC5545 engine) · caldav (client) · ui · sdk · types ·
               mobile-wrapper (Capacitor generator)
```

## Develop

```bash
pnpm install
pnpm dev                # web on :3102, server on :3101 (turbo)
pnpm check              # lint + typecheck + test + build
```

Point the server at an upstream CalDAV server (e.g. Nextcloud):

```bash
cd apps/server
CALDAV_BASE_URL=https://user@nextcloud.local/remote.php/dav \
  CALDAV_USERNAME=... CALDAV_PASSWORD=... pnpm dev
```

## Android

`@calendax/mobile-wrapper` (XER-104) generates the Capacitor wrapper + signed
release CI. Pre-baked `calendax` config:

```bash
pnpm --filter @calendax/mobile-wrapper exec xeroneon-mobile-wrap --example calendax
```

## License

Pending decision (AGPL-3.0 recommended — see PLAN.md Q1).