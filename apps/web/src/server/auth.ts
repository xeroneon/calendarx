/**
 * Auth server functions — the web app's shell over the CalendarX account gate
 * (XER-316).
 *
 * The thin server owns accounts + sessions and speaks `/api/auth/*`. On the
 * wire here, the web server-fn relays the browser's `cx_session` HttpOnly
 * cookie to the thin server as a `Cookie` header, and on login/signup plants
 * the freshly minted session token as a cookie on THIS response — so the raw
 * token is set as an HttpOnly cookie and never returned to browser JS.
 */
import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  getRequestHeaders,
  getRequestProtocol,
  setCookie,
} from '@tanstack/start-server-core'

const SESSION = 'cx_session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export interface AuthUser {
  id: string
  email: string
}

/** Cookie serialize attributes (structurally matches cookie-es CookieSerializeOptions). */
interface CookieAttrs {
  httpOnly?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  path?: string
  secure?: boolean
  maxAge?: number
}

const base = process.env.CALENDARX_API_URL ?? 'http://localhost:3101'

/** The request-scoped session token from the browser cookie (web origin). */
export function currentSessionToken(): string | undefined {
  return getCookie(SESSION)
}

function isHttps(): boolean {
  const headers = getRequestHeaders() as unknown as Record<string, string | undefined>
  const fwd = headers['x-forwarded-proto']
  if (typeof fwd === 'string') {
    const first = fwd.split(',')[0]
    return first?.trim() === 'https'
  }
  return getRequestProtocol() === 'https'
}

function sessionCookieOptions(): CookieAttrs {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isHttps(),
    maxAge: SESSION_MAX_AGE,
  }
}

/** Forward the browser session cookie to the thin server as a Cookie header. */
function relayHeaders(): Record<string, string> {
  const token = getCookie(SESSION)
  return token ? { Cookie: `${SESSION}=${encodeURIComponent(token)}` } : {}
}

interface AuthResult {
  ok: boolean
  status: number
  user?: AuthUser
  error?: string
}

/** Thin-server auth call that carries the relayed Cookie and returns a clear result. */
async function callAuth<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: { user?: AuthUser; token?: string } & T; error?: { message?: string } }> {
  const res = await fetch(`${base}/api/auth${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...relayHeaders(),
      ...(init.headers ?? {}),
    },
  })
  let body: { ok?: boolean; data?: { user?: AuthUser; token?: string } & T; error?: { message?: string } } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    body = {}
  }
  return { status: res.status, data: (body.data ?? {}) as never, error: body.error }
}

/** GET session — current account (AuthUser | null). */
export const me = createServerFn({ method: 'GET' })
  .validator((d: Record<string, never>) => d)
  .handler(async (): Promise<{ user: AuthUser | null }> => {
    const token = getCookie(SESSION)
    if (!token) return { user: null }
    const { status, data } = await callAuth('/me')
    if (status !== 200 || !data.user) return { user: null }
    return { user: data.user }
  })

/** POST signup — create an account and start a session. */
export const signup = createServerFn({ method: 'POST' })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { status, data: d, error } = await callAuth('/signup', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, password: data.password }),
    })
    if (status >= 400) return { ok: false, status, error: error?.message }
    if (d.token) setCookie(SESSION, d.token, sessionCookieOptions())
    return { ok: true, status, user: d.user }
  })

/** POST login — verify credentials and start a session. */
export const login = createServerFn({ method: 'POST' })
  .validator((d: { email: string; password: string }) => d)
  .handler(async ({ data }): Promise<AuthResult> => {
    const { status, data: d, error } = await callAuth('/login', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, password: data.password }),
    })
    if (status >= 400) return { ok: false, status, error: error?.message }
    if (d.token) setCookie(SESSION, d.token, sessionCookieOptions())
    return { ok: true, status, user: d.user }
  })

/** POST logout — invalidate the session (thin) and clear the web cookie. */
export const logout = createServerFn({ method: 'POST' })
  .validator((d: Record<string, never>) => d)
  .handler(async (): Promise<{ ok: true }> => {
    await callAuth('/logout', { method: 'POST', body: JSON.stringify({}) })
    deleteCookie(SESSION, sessionCookieOptions())
    return { ok: true }
  })