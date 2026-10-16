/**
 * Pure, unit-testable helpers for the CalendarX "connection" first-run/settings
 * surface (XER-310). Kept free of React/browser APIs so the logic is testable
 * under node vitest — build the form state and validation here, consume it from
 * the ConnectionScreen component.
 */

export type AuthMode = 'basic' | 'app-password' | 'oauth'

export interface AuthModeInfo {
  value: AuthMode
  label: string
  hint: string
  /** Whether the mode collects a username (all modes collect a secret field). */
  needsUsername: boolean
  /** Label for the secret field (password vs app password vs OAuth token). */
  credentialLabel: string
}

/** Auth-mode metadata driving the form (order = render order). */
export const AUTH_MODES: AuthModeInfo[] = [
  {
    value: 'basic',
    label: 'Basic (username + password)',
    hint: 'Standard HTTP basic auth for Radicale / CalDAV servers.',
    needsUsername: true,
    credentialLabel: 'Password',
  },
  {
    value: 'app-password',
    label: 'App password',
    hint: 'A dedicated app/token password (Nextcloud, iCloud, Fastmail).',
    needsUsername: true,
    credentialLabel: 'App password',
  },
  {
    value: 'oauth',
    label: 'OAuth / Bearer token',
    hint: 'Use a personal/bearer access token instead of a password.',
    needsUsername: false,
    credentialLabel: 'OAuth token',
  },
]

export function authModeInfo(mode: AuthMode): AuthModeInfo {
  return AUTH_MODES.find((m) => m.value === mode) ?? AUTH_MODES[0]!
}

/**
 * Normalize a user-typed server URL into a canonical principal URL, or null if
 * it cannot be a CalDAV endpoint. Adds `https://` when no scheme is given.
 */
export function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // If the user typed an explicit scheme, only http(s) is a CalDAV endpoint.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // Collapse a trailing slash so the stored principal URL is canonical
  // (including the root path, which URL.toString would otherwise render as "/").
  const path = url.pathname.replace(/\/+$/, '')
  return url.origin + path
}

/** True when the string is a valid, normalized CalDAV server URL. */
export function isValidServerUrl(raw: string): boolean {
  return normalizeServerUrl(raw) !== null
}

/** Parse + validate the form's server field, returning a friendly error. */
export function parseServerInput(raw: string): { ok: false; error: string } | { ok: true; url: string } {
  const url = normalizeServerUrl(raw)
  if (url === null) {
    return { ok: false, error: 'Enter a valid server URL, e.g. https://server.example/remote.php/dav' }
  }
  return { ok: true, url }
}

/** A friendly one-liner describing a live probe result (for the UI). */
export function describeProbe(
  result: { ok: boolean; principal?: string; calendars?: string[] } | Error | unknown,
): { tone: 'ok' | 'err'; message: string; calendars?: string[] } {
  if (result instanceof Error || (result as { ok?: boolean })?.ok === false) {
    const msg = result instanceof Error ? result.message : 'The server did not respond as a CalDAV endpoint.'
    return { tone: 'err', message: `Couldn’t connect: ${msg}` }
  }
  const r = result as { ok: boolean; principal?: string; calendars?: string[] }
  const cals = r.calendars && r.calendars.length ? r.calendars : undefined
  const count = cals?.length ?? 0
  return {
    tone: 'ok',
    message:
      count === 0
        ? 'Connected — found the server, but no calendar collections were listed.'
        : `Connected — found ${count} calendar${count === 1 ? '' : 's'}: ${cals!.join(', ')}`,
    calendars: cals,
  }
}