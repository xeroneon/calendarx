# CalendarX — Design & Repo Seed Plan (XER-303)

**Project:** CalendarX (`calendar-tasks`, Calendar + Tasks)
**Status:** Seed (C1) — design locked, repo stood up, follow-ons filed as backlog
**Owner (this card):** Axel (frontend)
**Date:** 2026-10-14

## 1. What this is

CalendarX is our own self-hosted, **CalDAV-generic CLIENT** calendar + tasks app
(web + PWA + Android), distributed open-source. It does NOT re-host your data:
it **connects to any standard CalDAV server** (Nextcloud Calendar, Radicale,
Baikal, iCloud) and gives that data a fast, opinionated, Linear-grade UI.

A Card/C1 seed card: stand up the repo with the proven Phase 2 module extracted
in and file the follow-on build cards. It is the extraction+scaffold, not the
finished product.

## 2. Design decisions (locked from XER-298 + XER-71 ground rules)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Name:** CalendarX | User decision (XER-298) |
| D2 | **Seed from existing Xeroneon Cloud Phase 2** (XER-78 RFC5545 engine + XER-79 calendar/tasks UI), extract+rebrand — **not** rebuilt from scratch | User decision; the engine + UI are proven and green on `~/cloud` |
| D3 | **CalDAV-generic CLIENT** — works against ANY CalDAV server (Nextcloud, Radicale, Baikal, iCloud). Our own deployment uses Nextcloud Calendar as the backend | The app stores *connection config*, never the event store |
| D4 | **Stack:** TanStack (Start + Router + Query), pnpm + Turborepo monorepo, TypeScript | User default + XER-71 stack |
| D5 | **Android:** Capacitor hybrid wrapper (XER-104 generalized wrapper) + signed release via XER-215 CI pattern, distributed via Obtainium | Reuse proven wrapper |
| D6 | **Repo:** NEW `calendax`, dual-origin (Gitea `Xeroneon/calendax` + GitHub `xeroneon/calendax`) | XER-63 convention |
| D7 | **License:** TBD — recommend **AGPL-3.0** for a distributed OSS app whose value is a UI over user-owned data (keeps the "our own" open ethos, prevents closed-source forks from locking others out). Fallback MIT. → **Open question Q1** | surface to user |
| D8 | **Design language:** Linear (near-black/crisp-white, indigo-violet accent, hairline borders, keyboard-first, Command-K) | carry over XER-74 design-system ground rule |

## 3. Repository layout (`~/calendax`)

```
calendax/                      (pnpm + Turborepo, TS)
├── apps/
│   ├── web/                   TanStack Start web + PWA (calendar/tasks UI + CalDAV connection screen)
│   ├── server/                thin API: stores CalDAV connection config + proxies to the upstream
│   └── mobile/                Capacitor Android wrapper (hybrid, from XER-104)
├── packages/
│   ├── calendar/              RFC 5545 engine — EVENTS+TASKS model, iCal parse/serialize,
│   │                          recurrence expansion, IANA timezones   ← reused verbatim from XER-78
│   ├── caldav/                CalDAV CLIENT: PROPFIND/REPORT/GET/PUT/DELETE against any server
│   ├── ui/                    Linear design system (XER-74)          ← reused + rebranded
│   ├── types/ sdk/            shared types + typed CalDAV client
│   └── mobile-wrapper/        XER-104 Capacitor generator (generalized, reusable)
└── .github/workflows/
    ├── ci.yml                 lint + typecheck + test + build
    └── release-android.yml    signed APK → GitHub Release (XER-215 pattern) for Obtainium
```

## 4. Extraction sources (`~/cloud`, all on `main`)

- `packages/calendar` → `packages/calendar` (engine reuse is verbatim; package renamed `@xeroneon/calendar` → `@calendax/calendar`; zero external deps, standalone).
- `apps/web/src/components/calendar/CalendarBrowser.tsx` + `apps/web/src/lib/calendar.ts` + `apps/web/src/server/calendar.ts` + route `apps/web/src/routes/calendar/index.tsx` → the web UI (XER-79).
- `packages/ui` → `packages/ui` (design system, `@xeroneon/ui` → `@calendax/ui`, `--xc-*` → `--cx-*` tokens).
- `packages/mobile-wrapper` → `packages/mobile-wrapper` (XER-104, already generalized) — add a `calendax` pre-baked example config.
- `.github/workflows/release-android.yml` → the XER-215 release CI pattern.
- `apps/web/src/lib/auth-call.ts` + `apps/web/src/server/api.ts` pattern → CalDAV connection/auth proxy.

## 5. Gap analysis → follows-on (the real build work)

The seed extracts and scaffolds; these cards do the product. Filed as backlog on the
CalendarX project (XER-303 §6 → XER-305..XER-309).

| Card | Scope | Dependency |
|------|-------|-----------|
| **CalDAV client hardening** | multi-server coverage (Nextcloud/Radicale/Baikal/iCloud), auth (Basic/Digest/app-password + OAuth for iCloud), timezone edge cases, pagination/etags | seed `packages/caldav` |
| **Calendar UI** | month/week/day views, recurrence editing, event create/edit dialog (CalendarBrowser seed exists) | CalDAV client |
| **Tasks UI** | VTODO list, completion model, due/percent-complete (engine supports already) | CalDAV client |
| **Android wrap** | run XER-104 wrapper generator for calendax, commit android/, wire origin | web app |
| **Release / distribution CI** | release-android.yml wired to GitHub Release + Obtainium channel + app signing secrets | Android wrap |
| **Connection/settings screen** | first-run "add your CalDAV server" (URL + credentials), test-connection | CalDAV client |
| **License selection** | add LICENSE + headers after Q1 | any (wait on Q1) |

## 6. This card's deliverable (done)

- ✅ Plan doc (this artifact, page-visible) locking stack/scope/repo.
- ✅ New dual-origin repo `calendax` stood up with Phase 2 code extracted in
  (RFC5545 engine, UI, design system, mobile wrapper, release-CI pattern).
- ✅ Follow-on card set filed as backlog (XER-305..).
- ⏳ Open question posted for the user.

## 7. Questions for you

- **Q1 (License):** AGPL-3.0 recommended (open ethos, protects user-owned data +
  deters closed-source forks). MIT is the lighter default. Which?
- **Q2 (Backend for the seed's own deploy):** confirmed Nextcloud Calendar as the
  local backend (per issue). Any server you specifically want validated first?
- **Q3 (Scope of C1):** this card stands up repo + extraction + backlog. The five
  build cards are parked at backlog so the tree stays quiet — "kick off" when you
  want the first (CalDAV client) dispatched.