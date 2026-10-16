# CalendarX — Design & Repo Seed Plan (XER-303)

**Project:** CalendarX (`calendar-tasks`, Calendar + Tasks)
**Status:** Seed (C1) — design locked, repo stood up, follow-ons filed as backlog
**Owner (this card):** Axel (frontend)
**Date:** 2026-10-14 · **Decisions confirmed by user** 2026-10-16 (Q1-Q3)

## 1. What this is

CalendarX is our own self-hosted, **CalDAV-generic CLIENT** calendar + tasks app
(web + PWA + Android), distributed open-source. It does NOT re-host your data:
it **connects to any standard CalDAV server** (Radicale, Nextcloud, Baikal,
iCloud) and gives that data a fast, opinionated, Linear-grade UI.

A C1 seed card: stand up the repo with the proven Phase 2 module extracted in and
file the follow-on build cards. It is the extraction+scaffold, not the finished
product.

## 2. Design decisions (locked — answers confirmed 2026-10-16)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Name:** CalendarX | User decision (XER-298) |
| D2 | **Seed from existing Xeroneon Cloud Phase 2** (XER-78 RFC5545 engine + XER-79 calendar/tasks UI), extract+rebrand — **not** rebuilt from scratch | Proven + green on `~/cloud` |
| D3 | **CalDAV-generic CLIENT** — works against ANY CalDAV server. Our deployment + seed backend = **Radicale** (open-source, per user Q2 2026-10-16). Nextcloud stays supported but is not our deploy default | Store *connection config*, never the event store |
| D4 | **Stack:** TanStack (Start + Router + Query), pnpm + Turborepo monorepo, TypeScript | User default + XER-71 stack |
| D5 | **Android:** Capacitor hybrid wrapper (XER-104) + signed release via XER-215 CI pattern, distributed via Obtainium. First-run connection is a **native** config shell (URL + Test + secure persist → load webview) | Reuse proven wrapper; native onboarding per user require |
| D6 | **Repo:** NEW `calendax`, dual-origin (Gitea `Xeroneon/calendax` + GitHub `xeroneon/calendax`) | XER-63 convention |
| D7 | **License: AGPL-3.0** (user Q1 2026-10-16) — LICENSE added to repo | distributed OSS, keeps it open, deters closed forks |
| D8 | **Design language:** Linear (near-black/crisp-white, indigo-violet accent, hairline borders, keyboard-first, Command-K) | carry over XER-74 ground rule |

## 3. Repository layout (`~/calendax`)

```
calendax/                      (pnpm + Turborepo, TS, AGPL-3.0)
├── apps/
│   ├── web/                   TanStack Start web + PWA (calendar/tasks UI + CalDAV connection screen)
│   ├── server/                thin API: stores CalDAV connection config + proxies to the upstream
│   └── mobile/                Capacitor Android wrapper (hybrid, from XER-104) + native connect shell
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

- `packages/calendar` → `packages/calendar` (engine reuse verbatim; renamed `@xeroneon/calendar` → `@calendax/calendar`; zero external deps).
- `apps/web/src/.../CalendarBrowser.tsx` + `lib/calendar.ts` + `server/calendar.ts` + route `calendar/index.tsx` → the web UI (XER-79).
- `packages/ui` → `packages/ui` (design system, `@xeroneon/ui` → `@calendax/ui`, `--xc-*` → `--cx-*`).
- `packages/mobile-wrapper` → `packages/mobile-wrapper` (XER-104, already generalized) + a `calendax` pre-baked example config.
- `.github/workflows/release-android.yml` → the XER-215 release CI pattern.
- `apps/web/src/lib/auth-call.ts` + `apps/web/src/server/api.ts` pattern → CalDAV connection/auth proxy.

## 5. Gap analysis → follow-ons (filed XER-305..XER-312, all parked at backlog)

| Card | Scope | Dependency |
|------|-------|-----------|
| **XER-305 CalDAV client hardening** | multi-server coverage (Radicale primary/Nextcloud/Baikal/iCloud), auth (Basic/Digest/app-password + OAuth iCloud), timezone edges, pagination/etags | seed `packages/caldav` |
| **XER-306 Calendar UI** | month/week/day views, recurrence editing, event create/edit (CalendarBrowser seed exists) | CalDAV client |
| **XER-307 Tasks UI** | VTODO list, completion model, due/percent-complete (engine supports) | CalDAV client |
| **XER-308 Android wrap** | run XER-104 generator, commit android/, wire origin | web app |
| **XER-309 Release / distribution CI** | release-android.yml wired to GH Release + Obtainium + signing secrets | Android wrap |
| **XER-310 Connection/settings screen** | first-run "add your CalDAV server" (URL + creds), test-connection | CalDAV client |
| **XER-311 (n/a)** | — | — |
| **XER-312 Android native connect onboarding** | native (Kotlin) config shell: server URL, Test connection (health/CalDAV discovery), secure persist (Keystore), then load webview. .well-known/caldav discovery; optional demo instance. Full native (Compose, no webview) UI = later phase, deliberately NOT a blocker | Android wrap |

**Kick-off is GATED** (user Q3 2026-10-16): "we will wait until we get the plan
fully in order." No follow-on card may be dispatched until the user says go. The
GATED clause is in each card's description.

## 6. This card's deliverable (done)

- ✅ Plan doc (this artifact, page-visible) locking stack/scope/repo/**license**/**Android-connect**.
- ✅ New dual-origin repo `calendax` stood up with Phase 2 code extracted in.
- ✅ AGPL-3.0 LICENSE added (Q1 confirmed).
- ✅ Backend default updated to Radicale (Q2 confirmed; CalDAV-generic preserves the others).
- ✅ Follow-on card set filed as backlog (XER-305..XER-312).
- ✅ Questions answered by user; kick-off deferred per Q3.

## 7. Questions (resolved 2026-10-16)

- **Q1 (License):** ✅ **AGPL-3.0** — user confirmed.
- **Q2 (Backend):** ✅ **Radicale** (open) for our deploy/seed; Nextcloud remains supported (CalDAV-generic). User answered "something open like radicale".
- **Q3 (Kick-off):** ✅ Deferred — "we will wait until we get the plan fully in order." No dispatch yet.