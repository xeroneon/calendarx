import { describe, expect, it } from 'vitest'
import {
  AUTH_MODES,
  authModeInfo,
  normalizeServerUrl,
  isValidServerUrl,
  parseServerInput,
  describeProbe,
} from './connections'

describe('@calendarx/web connection helpers', () => {
  it('lists the three auth modes in render order', () => {
    expect(AUTH_MODES.map((m) => m.value)).toEqual(['basic', 'app-password', 'oauth'])
    expect(authModeInfo('oauth').needsUsername).toBe(false)
    expect(authModeInfo('basic').credentialLabel).toBe('Password')
    expect(authModeInfo('app-password').credentialLabel).toBe('App password')
  })

  it('adds https when no scheme is given', () => {
    expect(normalizeServerUrl('nextcloud.dev/remote.php/dav')).toBe('https://nextcloud.dev/remote.php/dav')
  })

  it('collapses trailing slashes and preserves an existing scheme/port', () => {
    expect(normalizeServerUrl('http://localhost:5232/')).toBe('http://localhost:5232')
    expect(normalizeServerUrl('radicale.local/')).toBe('https://radicale.local')
  })

  it('rejects empty, unparseable, and non-http(s) inputs', () => {
    expect(normalizeServerUrl('  ')).toBeNull()
    expect(normalizeServerUrl('not a url')).toBeNull() // space breaks URL parsing
    expect(isValidServerUrl('ftp://server.example')).toBe(false)
    expect(isValidServerUrl('javascript:alert(1)')).toBe(false)
  })

  it('accepts a bare host and a full https URL', () => {
    expect(isValidServerUrl('radicale.local')).toBe(true)
    expect(isValidServerUrl('https://nextcloud.dev/remote.php/dav')).toBe(true)
  })

  it('parseServerInput returns a friendly error for invalid input', () => {
    const bad = parseServerInput('')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('valid server URL')
    const good = parseServerInput('radicale.local')
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.url).toBe('https://radicale.local')
  })

  it('describeProbe reports success with a calendar list', () => {
    const d = describeProbe({ ok: true, principal: 'p', calendars: ['Work', 'Personal'] })
    expect(d.tone).toBe('ok')
    expect(d.message).toContain('2 calendars')
    expect(d.calendars).toEqual(['Work', 'Personal'])
  })

  it('describeProbe reports failure with a friendly message', () => {
    expect(describeProbe({ ok: false, principal: undefined, calendars: undefined }).tone).toBe('err')
    expect(describeProbe(new Error('HTTP 401')).message).toContain('HTTP 401')
  })
})