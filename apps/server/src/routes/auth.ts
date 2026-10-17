/**
 * Account gate routes (XER-316): signup / login / logout / me.
 *
 * Signup + login mint a session token whose raw value is written ONLY to an
 * HttpOnly `cx_session` cookie (relayed to the browser through the web server-fn
 * layer — it is never returned in a body a client can read). Every other API
 * segment is gated by `requireAuth` and scoped to the session's user.
 */
import { Router, type Request, type Response } from 'express'
import { authStore, SESSION_COOKIE, sessionCookieOptions, isSecureRequest, currentAuthUser } from '../auth.js'

export const authRouter = Router()

interface AuthBody {
  email?: string
  password?: string
}

function validPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 256
}
function validEmail(e: unknown): e is string {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

function authError(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ ok: false, error: { code, message } })
}

function writeSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(isSecureRequest(res.req)))
}

/** GET /api/auth/me — the signed-in account, or 401. */
authRouter.get('/me', (_req: Request, res: Response) => {
  const user = currentAuthUser(res.req)
  if (!user) {
    authError(res, 'auth_required', 'not signed in', 401)
    return
  }
  res.json({ ok: true, data: { user: authStore.toAuthUser(user) } })
})

/** POST /api/auth/signup — create an account and start a session. */
authRouter.post('/signup', async (req: Request, res: Response) => {
  const { email, password } = (req.body ?? {}) as AuthBody
  if (!validEmail(email) || !validPassword(password)) {
    authError(res, 'invalid', 'a valid email and a password of 8+ characters are required')
    return
  }
  const norm = (email as string).trim().toLowerCase()
  if (authStore.findByEmail(norm)) {
    authError(res, 'exists', 'an account with that email already exists', 409)
    return
  }
  const user = await authStore.createUser(norm, password as string)
  const token = await authStore.createSession(user.id)
  writeSessionCookie(res, token)
  res.status(201).json({ ok: true, data: { user: authStore.toAuthUser(user), token } })
})

/** POST /api/auth/login — verify credentials and start a session. */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = (req.body ?? {}) as AuthBody
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    authError(res, 'invalid', 'email and password are required')
    return
  }
  const user = await authStore.verifyPassword(email, password)
  if (!user) {
    authError(res, 'bad_credentials', 'invalid email or password', 401)
    return
  }
  const token = await authStore.createSession(user.id)
  writeSessionCookie(res, token)
  res.json({ ok: true, data: { user: authStore.toAuthUser(user), token } })
})

/** POST /api/auth/logout — invalidate the session and clear the cookie. */
authRouter.post('/logout', async (req: Request, res: Response) => {
  await authStore.destroySession(req.sessionToken)
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(isSecureRequest(req)))
  res.json({ ok: true, data: { signedOut: true } })
})