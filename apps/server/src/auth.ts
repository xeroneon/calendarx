/**
 * CalendarX account gate — password hashing, persistent user/session store,
 * and session cookie handling (XER-316).
 *
 * Each account owns its own CalDAV connection config (stored server-side,
 * keyed by userId) so an unauthenticated visitor and every other account never
 * see anyone else's calendar. Passwords are hashed with scrypt; session tokens
 * are random and stored hashed; the raw token rides only in an HttpOnly cookie,
 * never in browser JS.
 *
 * Persistence: users + sessions are flushed to JSON files under
 * `CALENDARX_DATA_DIR` (default `<cwd>/.data`) so accounts survive a restart
 * (replacing the old throwaway in-memory connection entirely).
 */

import {
  randomBytes,
  scrypt as scryptCb,
  createHash,
  timingSafeEqual,
} from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { CookieOptions, Request, Response, NextFunction } from 'express'

export const SESSION_COOKIE = 'cx_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

export interface User {
  id: string
  email: string
  passHash: string
  createdAt: string
}

export interface Session {
  tokenHash: string
  userId: string
  createdAt: string
  expiresAt: string
}

export interface AuthUser {
  id: string
  email: string
  createdAt: string
}

function scrypt(...args: Parameters<typeof scryptCb>): ReturnType<typeof scryptCb> {
  return scryptCb(...args)
}
const scryptAsync = (password: string, salt: Buffer, keylen: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) =>
      err ? reject(err) : resolve(key),
    )
  })

function dataDir(): string {
  return process.env.CALENDARX_DATA_DIR ?? path.join(process.cwd(), '.data')
}

interface PersistedShape {
  users: User[]
  sessions: Session[]
}

class AuthStore {
  private users = new Map<string, User>()
  private byEmail = new Map<string, User>()
  private sessions = new Map<string, Session>()
  private get file(): string {
    return path.join(dataDir(), 'auth.json')
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const data = JSON.parse(raw) as PersistedShape
      for (const u of data.users ?? []) {
        this.users.set(u.id, u)
        this.byEmail.set(u.email.toLowerCase(), u)
      }
      const now = Date.now()
      for (const s of data.sessions ?? []) {
        if (Date.parse(s.expiresAt) > now) this.sessions.set(s.tokenHash, s)
      }
    } catch (err) {
      // Nonexistent or corrupt store → start empty (first run).
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      // A corrupt file shouldn't brick the server; log and reset.
      console.warn(`[auth] could not load ${this.file}: ${(err as Error).message}`)
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      const out: PersistedShape = {
        users: [...this.users.values()],
        sessions: [...this.sessions.values()],
      }
      await fs.writeFile(this.file, JSON.stringify(out, null, 2), { mode: 0o600 })
    } catch (err) {
      console.warn(`[auth] could not persist ${this.file}: ${(err as Error).message}`)
    }
  }

  /** Test hook: clear in-memory accounts/sessions and reload from the data dir. */
  async resetAndLoad(): Promise<void> {
    this.users.clear()
    this.byEmail.clear()
    this.sessions.clear()
    await this.load()
  }

  async createUser(email: string, password: string): Promise<User> {
    const norm = email.trim().toLowerCase()
    const salt = randomBytes(16)
    const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN)
    const passHash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
    const user: User = { id: cryptoUid(), email: norm, passHash, createdAt: new Date().toISOString() }
    this.users.set(user.id, user)
    this.byEmail.set(norm, user)
    await this.persist()
    return user
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = this.byEmail.get(email.trim().toLowerCase())
    if (!user) return null
    try {
      const [scheme, saltHex, hashHex] = user.passHash.split('$')
      if (scheme !== 'scrypt' || !saltHex || !hashHex) return null
      const candidate = await scryptAsync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN)
      const expected = Buffer.from(hashHex, 'hex')
      if (candidate.length !== expected.length) return null
      return timingSafeEqual(candidate, expected) ? user : null
    } catch {
      return null
    }
  }

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex')
    const tokenHash = sha256(token)
    const session: Session = {
      tokenHash,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }
    this.sessions.set(tokenHash, session)
    await this.persist()
    return token
  }

  async userForToken(token: string | undefined): Promise<User | null> {
    if (!token) return null
    const session = this.sessions.get(sha256(token))
    if (!session) return null
    if (Date.now() >= Date.parse(session.expiresAt)) {
      this.sessions.delete(session.tokenHash)
      await this.persist()
      return null
    }
    return this.users.get(session.userId) ?? null
  }

  async destroySession(token: string | undefined): Promise<void> {
    if (!token) return
    this.sessions.delete(sha256(token))
    await this.persist()
  }

  findByEmail(email: string): User | null {
    return this.byEmail.get(email.trim().toLowerCase()) ?? null
  }

  toAuthUser(user: User): AuthUser {
    return { id: user.id, email: user.email, createdAt: user.createdAt }
  }
}

export const authStore = new AuthStore()

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function cryptoUid(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as { randomUUID?: () => string }).randomUUID === 'function') {
    return (crypto as { randomUUID: () => string }).randomUUID()
  }
  return `${Date.now().toString(36)}-${randomBytes(16).toString('hex')}`
}

/** Parse the `cx_session` token out of a request Cookie header. */
export function sessionTokenFrom(req: Request): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const name = part.slice(0, idx).trim()
    if (name === SESSION_COOKIE) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return undefined
}

/** Express middleware: attach `req.user` when a valid session is present. */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = sessionTokenFrom(req)
    const user = token ? await authStore.userForToken(token) : null
    ;(req as Request & { authUser?: User | null }).authUser = user
    ;(req as Request & { sessionToken?: string | undefined }).sessionToken = token
    next()
  } catch (err) {
    next(err)
  }
}

/** Express middleware: require an authenticated account (401 otherwise). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { authUser?: User | null }).authUser ?? null
  if (!user) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'authentication required' } })
    return
  }
  next()
}

export function currentAuthUser(req: Request): User | null {
  return (req as Request & { authUser?: User | null }).authUser ?? null
}

/** Base cookie attributes shared by the web relay and direct server use. */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: SESSION_TTL_MS / 1000,
  }
}

export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true
  const fwd = req.headers['x-forwarded-proto']
  return typeof fwd === 'string' && fwd.split(',')[0]?.trim() === 'https'
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      /** Raw session token for the current request (when a session is valid). */
      sessionToken?: string
      /** The authenticated account, or null when there is no valid session. */
      authUser?: User | null
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */