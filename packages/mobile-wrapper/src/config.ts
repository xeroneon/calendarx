/**
 * Config for generating a reusable Capacitor Android wrapper for a web app.
 *
 * Ship one of these per web app you want to wrap. `renderMobileWrapper(config)`
 * produces a working `capacitor.config.ts` + `.github/workflows/release-android.yml`
 * (+ runbook) so a future web app can be wrapped for Android without redoing the
 * setup (Xeroneon Cloud P4.3 / XER-104).
 *
 * Two proven shapes:
 *  - 'monorepo'  — e.g. Xeroneon Cloud (pnpm + Turborepo, wrapper under
 *                  apps/<name>, web client built with a package filter).
 *  - 'single'    — e.g. MTG Free (a standalone npm app; capacitor.config.ts and
 *                  android/ live at the repo root, build via the app's own script).
 */
export type WrapperShape = 'monorepo' | 'single'

export interface MobileWrapperConfig {
  /** Application package id, e.g. `dev.xeroneon.cloud`. */
  appId: string
  /** Human-facing app name, e.g. `Xeroneon Cloud`. */
  appName: string
  /** Shape of the host repo. */
  shape: WrapperShape
  /** Path from the Dir in which capacitor.config.ts lives to the built web client. */
  webDir: string
  /** Env var name that injects the LIVE origin (baked at `cap sync`). */
  originEnv: string
  /** Fallback origin baked when originEnv is absent (should be the live origin). */
  defaultOrigin: string
  /**
   * Shell command that builds the web client (Capacitor's webDir target) AND any
   * upstream workspace deps it needs. Monorepo: wrap in quotes, e.g.
   * `pnpm --filter "@calendarx/web..." build` (the `...` includes upstream
   * workspaces). Single-app: e.g. `npm run build` or `pnpm build`.
   */
  buildWebCommand: string
  /**
   * npm/pnpm/… install command run in CI before building the web client.
   * Monorepo default: `pnpm install --frozen-lockfile`. Single-app npm default:
   * `npm ci`.
   */
  installCommand: string
  /**
   * Predictable staged APK prefix, e.g. `xeroneon-cloud` -> `<prefix>-v<v>.apk`.
   */
  apkPrefix: string
  /** GH owner/repo that owns the release (source repo), e.g. `xeroneon/cloud`. */
  sourceRepo: string
  /** GH owner/repo of the PUBLIC Obtainium release channel, e.g. `xeroneon/cloud-releases`. */
  publicReleaseRepo: string
  /** Directory (relative to repo root) of the capacitor wrapper package. Monorepo only. */
  wrapperDir: string
  /**
   * Relative path to the web package.json used to derive the release version.
   * Monorepo: `apps/web/package.json`. Single-app: `package.json`.
   */
  versionPkgJson: string
  /** Cap sync working directory. Monorepo: the wrapper dir; single: `.`. */
  capSyncDir: string
}

/** Pre-baked configs for the two apps already wrapped (kept as templates/examples). */
export const CLOUD_EXAMPLE: MobileWrapperConfig = {
  appId: 'dev.xeroneon.cloud',
  appName: 'Xeroneon Cloud',
  shape: 'monorepo',
  webDir: '../../apps/web/dist/client',
  originEnv: 'CLOUD_ANDROID_ORIGIN',
  defaultOrigin: 'https://cloud.xeroneon.dev',
  buildWebCommand: 'pnpm --filter "@calendarx/web..." build',
  installCommand: 'pnpm install --frozen-lockfile',
  apkPrefix: 'xeroneon-cloud',
  sourceRepo: 'xeroneon/cloud',
  publicReleaseRepo: 'xeroneon/cloud-releases',
  wrapperDir: 'apps/mobile',
  versionPkgJson: './apps/web/package.json',
  capSyncDir: 'apps/mobile',
}

export const MTG_FREE_EXAMPLE: MobileWrapperConfig = {
  appId: 'dev.xeroneon.mtg',
  appName: 'MTG Free',
  shape: 'single',
  webDir: '.output/public',
  originEnv: 'MTG_FREE_ANDROID_ORIGIN',
  defaultOrigin: 'https://mtg.xeroneon.dev',
  buildWebCommand: 'npm run build',
  installCommand: 'npm ci',
  apkPrefix: 'mtg-free',
  sourceRepo: 'xeroneon/mtg-free',
  publicReleaseRepo: 'xeroneon/mtg-free-releases',
  wrapperDir: '.',
  versionPkgJson: './package.json',
  capSyncDir: '.',
}

/**
 * Pre-baked CalendarX config (XER-303): the CalendarX web app wrapped for
 * Android. `apps/web` builds its client to `dist/client` (Capacitor webDir);
 * the origin env is baked at `cap sync` from `CALENDARX_ANDROID_ORIGIN`
 * (default `https://calendarx.xeroneon.dev`).
 */
export const CALENDARX_EXAMPLE: MobileWrapperConfig = {
  appId: 'dev.calendarx.app',
  appName: 'CalendarX',
  shape: 'monorepo',
  webDir: '../../apps/web/dist/client',
  originEnv: 'CALENDARX_ANDROID_ORIGIN',
  defaultOrigin: 'https://calendarx.xeroneon.dev',
  buildWebCommand: 'pnpm --filter "@calendarx/web..." build',
  installCommand: 'pnpm install --frozen-lockfile',
  apkPrefix: 'calendarx',
  sourceRepo: 'xeroneon/calendarx',
  publicReleaseRepo: 'xeroneon/calendarx-releases',
  wrapperDir: 'apps/mobile',
  versionPkgJson: './apps/web/package.json',
  capSyncDir: 'apps/mobile',
}