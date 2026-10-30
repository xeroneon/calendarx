# Building the CalendarX APK yourself

The Android app is a **Capacitor wrapper** (`apps/mobile`) around the web build,
with a native first-run shell that lets any user point it at **their own**
CalendarX server. You can build and sign it yourself — either locally or by
forking the repo and using the GitHub Actions workflow.

## Prerequisites

- Node 22+, pnpm 9
- Android SDK with **platform 36 + build-tools 36** (for the Capacitor 8.5.x /
  AGP 8 layout), or rely on CI which provisions it
- JDK 21 (AGP 8 requires 17+; the workflow uses 21)
- A Java **JKS keystore** containing your Android signing key

## 1. Point the wrapper at YOUR server

The baked live origin defaults to `https://calendar.xeroneon.dev`. Override it
with the `CALENDARX_ANDROID_ORIGIN` env var before `cap sync` — it bakes into
`capacitor.config.ts` and sets the **prefilled** origin in the app's first-run
setup screen (users can still type any server):

```bash
cd apps/mobile
CALENDARX_ANDROID_ORIGIN=https://calendar.example.com pnpm exec cap sync android
```

## 2. Generate a signing keystore (once)

```bash
mkdir -p ~/calendarx/.keystore         # gitignored — never commit
keytool -genkeypair \
  -keystore .keystore/calendarx.keystore \
  -alias calendarx -storepass <storepass> -keypass <keypass> \
  -dname "CN=CalendarX,O=You" -validity 10950 -storetype jks
```

`.keystore/` and `local.properties` are already gitignored.

## 3a. Build locally (signed)

```bash
cd apps/mobile/android
./gradlew \
  -PversionName=0.5.0 -PversionCode=500 \
  -PsigningStoreFile="$PWD/../../.keystore/calendarx.keystore" \
  -PsigningStorePassword="$STORE_PASS" \
  -PsigningKeyAlias=calendarx \
  -PsigningKeyPassword="$KEY_PASS" \
  assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

For CI (GitHub Actions) the shorthand is a dry compile check:
`./gradlew :app:compileDebugKotlin` (no SDK install needed for Kotlin compile).

## 3b. Build via GitHub Actions (fork the repo)

Fork `xeroneon/calendarx`, then in **Settings → Secrets → Actions** add:

| Secret | Value |
|---|---|
| `ANDROID_SIGNING_KEYSTORE_BASE64` | `base64 -w0 .keystore/calendarx.keystore` |
| `ANDROID_SIGNING_KEYSTORE_PASSWORD` | keystore storepass |
| `ANDROID_SIGNING_KEY_ALIAS` | `calendarx` |
| `ANDROID_SIGNING_KEY_PASSWORD` | keystore keypass |
| `CALENDARX_ANDROID_ORIGIN` | your server origin (e.g. `https://calendar.example.com`) |
| `RELEASE_REPO_PAT` | (optional) a classic PAT with `repo` scope if you also publish to a public `calendarx-releases` channel |

Push a `v*` tag (e.g. `v0.5.0`) and
[release-android.yml](../.github/workflows/release-android.yml) builds the signed
APK, attaches it to a GitHub Release, and optionally mirrors it to your public
Obtainium channel (default `xeroneon/calendarx-releases`).

## Installing the APK

With **Obtainium**, add a source pointing at either the GitHub Release tag page
of your fork or the stable public channel. Otherwise download the `.apk` from
the release and sideload it (`Install unknown apps` on Android).

## Notes

- `apps/mobile/android/app/src/main/assets/capacitor.config.json` and
  `local.properties` are generated/ignored — edit `capacitor.config.ts`, not the
  committed/ignored artifacts.
- The app never hardcodes *your* user's data — the first-run screen persists the
  server origin (encrypted) and each account's CalDAV server is configured
  in-app via the Connection screen.