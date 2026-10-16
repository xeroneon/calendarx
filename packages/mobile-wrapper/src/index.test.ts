import { describe, it, expect } from 'vitest'
import {
  renderMobileWrapper,
  renderRunbook,
  CLOUD_EXAMPLE,
  MTG_FREE_EXAMPLE,
  CALENDARX_EXAMPLE,
  type MobileWrapperConfig,
} from './index.js'

describe('@calendarx/mobile-wrapper', () => {
  it('renders a valid capacitor.config.ts for the monorepo (cloud) shape', () => {
    const { capacitorConfig } = renderMobileWrapper(CLOUD_EXAMPLE)
    expect(capacitorConfig).toContain("appId: 'dev.xeroneon.cloud'")
    expect(capacitorConfig).toContain("appName: 'Xeroneon Cloud'")
    expect(capacitorConfig).toContain("webDir: '../../apps/web/dist/client'")
    expect(capacitorConfig).toContain("process.env.CLOUD_ANDROID_ORIGIN || 'https://cloud.xeroneon.dev'")
    expect(capacitorConfig).toContain("androidScheme: 'https'")
    expect(capacitorConfig).toContain('url: origin')
  })

  it('renders config for the single-app (mtg) shape', () => {
    const { capacitorConfig } = renderMobileWrapper(MTG_FREE_EXAMPLE)
    expect(capacitorConfig).toContain("appId: 'dev.xeroneon.mtg'")
    expect(capacitorConfig).toContain("webDir: '.output/public'")
    expect(capacitorConfig).toContain('MTG_FREE_ANDROID_ORIGIN')
  })

  it('monorepo workflow uses pnpm build filter, pnpm cache and pnpm cap sync', () => {
    const { releaseWorkflow } = renderMobileWrapper(CLOUD_EXAMPLE)
    expect(releaseWorkflow).toContain('pnpm --filter "@calendarx/web..." build')
    expect(releaseWorkflow).toContain('cache: pnpm')
    expect(releaseWorkflow).toContain('pnpm exec cap sync android')
    expect(releaseWorkflow).toContain('xeroneon-cloud-v${{ steps.ver.outputs.version }}.apk')
    // The `...` must be preserved verbatim (workspace-filter expansion, not a glob).
    expect(releaseWorkflow).not.toContain('@calendarx/web.. build')
    expect(releaseWorkflow).toContain('pnpm --filter "@calendarx/web..." build')

    expect(releaseWorkflow).toContain('working-directory: apps/mobile/android')
  })

  it('single-app workflow uses npm cache, npx cap sync and the right apk prefix', () => {
    const { releaseWorkflow } = renderMobileWrapper(MTG_FREE_EXAMPLE)
    expect(releaseWorkflow).toContain('cache: npm')
    expect(releaseWorkflow).toContain('npm run build')
    expect(releaseWorkflow).toContain('npx cap sync android')
    expect(releaseWorkflow).toContain('mtg-free-v${{ steps.ver.outputs.version }}.apk')
    expect(releaseWorkflow).toContain('npm ci')
  })

  it('workflow carries all the non-negotiable CI pieces', () => {
    const { releaseWorkflow } = renderMobileWrapper(CLOUD_EXAMPLE)
    // signing secret decode + keystore verification
    expect(releaseWorkflow).toContain('ANDROID_SIGNING_KEYSTORE_BASE64')
    expect(releaseWorkflow).toContain('secret empty/missing')
    // gradle signing props driven by -P
    expect(releaseWorkflow).toContain('-PsigningStoreFile')
    expect(releaseWorkflow).toContain('-PsigningKeyAlias')
    // Obtainium mirror via cross-repo PAT
    expect(releaseWorkflow).toContain('RELEASE_REPO_PAT')
    expect(releaseWorkflow).toContain('xeroneon/cloud-releases')
    // SDK setup drops the broken android-actions/setup-android --licenses step
    expect(releaseWorkflow).not.toContain('android-actions/setup-android')
    expect(releaseWorkflow).toContain('sdkmanager')
  })

  it('runbook documents keystore, secrets and public-channel setup for a future app', () => {
    const rb = renderRunbook(CLOUD_EXAMPLE)
    expect(rb).toContain('keytool -genkeypair')
    expect(rb).toContain('ANDROID_SIGNING_KEYSTORE_BASE64')
    expect(rb).toContain('RELEASE_REPO_PAT')
    expect(rb).toContain('xeroneon/cloud-releases')
    expect(rb).toContain('Obtainium')
    expect(rb).toContain('verify_apk_origin.py')
  })
})

describe('CalendarX example (XER-303): a fresh app renders from config alone', () => {
  it('renders a valid monorepo capacitor config for CalendarX', () => {
    const { capacitorConfig } = renderMobileWrapper(CALENDARX_EXAMPLE)
    expect(capacitorConfig).toContain("appId: 'dev.calendarx.app'")
    expect(capacitorConfig).toContain("appName: 'CalendarX'")
    expect(capacitorConfig).toContain("webDir: '../../apps/web/dist/client'")
    expect(capacitorConfig).toContain("process.env.CALENDARX_ANDROID_ORIGIN")
  })

  it('renders a release workflow with the CalendarX identity + Obtainium channel', () => {
    const { releaseWorkflow } = renderMobileWrapper(CALENDARX_EXAMPLE)
    expect(releaseWorkflow).toContain('pnpm --filter "@calendarx/web..." build')
    expect(releaseWorkflow).toContain('calendarx-v${{ steps.ver.outputs.version }}.apk')
    expect(releaseWorkflow).toContain('xeroneon/calendarx-releases')
    expect(releaseWorkflow).toContain('-PsigningStoreFile')
  })

  it('runbook documents the CalendarX keystore/secrets/public-channel setup', () => {
    const rb = renderRunbook(CALENDARX_EXAMPLE)
    expect(rb).toContain('keytool -genkeypair')
    expect(rb).toContain('ANDROID_SIGNING_KEYSTORE_BASE64')
    expect(rb).toContain('xeroneon/calendarx-releases')
    expect(rb).toContain('Obtainium')
  })
})