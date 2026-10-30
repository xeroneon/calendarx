# CalendarX

Your own **self-hosted, CalDAV-generic calendar + tasks app** — web + PWA +
Android, distributed open-source.

CalendarX does **not** re-host your data. It is a **CalDAV-generic client**: it
connects to any standard CalDAV server — Nextcloud Calendar, Radicale, Baikal,
iCloud — and puts that data behind a fast, opinionated, Linear-grade UI. The reference
deployment runs **Radicale** as the upstream backend; Radicale is the seed/demo
backend but never the only one — CalDAV-generic stays the contract.

Seeded from the proven Xeroneon Cloud Phase 2 module (XER-78 RFC 5545 engine +
XER-79 calendar/tasks UI), extracted and rebranded here rather than rebuilt from
scratch.

## Stack

- **pnpm + Turborepo** monorepo, TypeScript end-to-end
- **TanStack Start** (Router + Query) web app + PWA
- **Capacitor** hybrid wrapper → signed **Android APK** → Obtainium
- RFC 5545 engine (`@calendarx/calendar`) + **CalDAV client** (`@calendarx/caldav`)

## Layout

```
apps/web       TanStack Start web + PWA (calendar/tasks UI + CalDAV connection)
apps/server    thin API: stores the CalDAV connection + proxies to the upstream
apps/mobile    Capacitor Android wrapper (from @calendarx/mobile-wrapper)
packages/      calendar (RFC5545 engine) · caldav (client) · ui · sdk · types ·
               mobile-wrapper (Capacitor generator)
```

## Quick start — self-host with Docker

One command brings up the web app + API:

```bash
docker compose up -d
# → open http://<host>:3006
```

Then create your account and connect any CalDAV server (Radicale, Nextcloud,
Baikal, iCloud) from the in-app **Connection** screen — accounts and
connections persist in `./data`. Lock a single-user instance with
`CALENDARX_ALLOW_SIGNUP=false` and add phone reminders with the optional
UnifiedPush gateway (`docker compose --profile up up -d`). See
[docker-compose.yml](docker-compose.yml).

## Notifications

CalendarX delivers reminders to your phone over **UnifiedPush** — your own
gateway, no Google/FCM. Full self-hoster guide (stand up a UP gateway, install a
distributor on the phone, point the server at it, the end-to-end flow, and the
force-stop caveat): **[docs/push-notifications.md](docs/push-notifications.md)**.

## Develop

```bash
pnpm install
pnpm dev                # web on :3102, server on :3101 (turbo)
pnpm check              # lint + typecheck + test + build
```

Open http://localhost:3102, create an account, then connect your CalDAV server
from the in-app **Connection** screen (per-account; the server stores the
connection). See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev workflow.

## Android

`@calendarx/mobile-wrapper` (XER-104) generates the Capacitor wrapper + signed
release CI. Pre-baked `calendarx` config:

```bash
pnpm --filter @calendarx/mobile-wrapper exec xeroneon-mobile-wrap --example calendarx
```

Build and sign the APK for your own server (keystore + `CALENDARX_ANDROID_ORIGIN`
override, local or via GitHub Actions): **[docs/build-apk.md](docs/build-apk.md)**.

## License

[GNU Affero General Public License v3.0](LICENSE) — distributed open source.

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · Security:
[SECURITY.md](SECURITY.md) · Notifications: [docs/push-notifications.md](docs/push-notifications.md).