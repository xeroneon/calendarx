/**
 * CalendarX push subscription registry (XER-334, Card B).
 *
 * Each signed-in account registers **its device's UnifiedPush endpoint** here —
 * the URL the CalendarX server pushes reminder payloads to. The endpoint is
 * obtained by the app from a UnifiedPush distributor on the phone (the ntfy
 * app is a common one) and POSTed to this server behind the existing auth.
 * Only the owning account may read/update/remove its own subscription.
 *
 * Persisted to `push-subscriptions.json` in `CALENDARX_DATA_DIR` (mode 0600,
 * atomic tmp+rename), exactly like the auth + connection stores, so a device
 * stays registered across app redeploys / server restarts.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

/** The only transport the platform ships today — see `push/transport.ts`. */
export type PushTransportKind = 'unifiedpush'

export interface PushSubscription {
  transport: PushTransportKind
  /** UnifiedPush endpoint the gateway delivers to, e.g. https://<host>/<topic>. */
  endpoint: string
  /** UTC ISO of the last (re-)registration. */
  updatedAt: string
}

function dataDir(): string {
  return process.env.CALENDARX_DATA_DIR ?? path.join(process.cwd(), '.data')
}

interface PersistedShape {
  subscriptions: Array<{ userId: string; subscription: PushSubscription }>
}

export class PushSubscriptionStore {
  private byUser = new Map<string, PushSubscription>()
  private get file(): string {
    return path.join(dataDir(), 'push-subscriptions.json')
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const data = JSON.parse(raw) as PersistedShape
      this.byUser.clear()
      for (const entry of data.subscriptions ?? []) {
        if (entry?.userId && entry?.subscription?.endpoint) {
          this.byUser.set(entry.userId, entry.subscription)
        }
      }
    } catch (err) {
      // Nonexistent or corrupt store → start empty (first run / migrate).
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      console.warn(`[push] could not load ${this.file}: ${(err as Error).message}`)
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      const out: PersistedShape = {
        subscriptions: [...this.byUser.entries()].map(([userId, subscription]) => ({ userId, subscription })),
      }
      const tmp = `${this.file}.tmp`
      await fs.writeFile(tmp, JSON.stringify(out, null, 2), { mode: 0o600 })
      await fs.rename(tmp, this.file)
    } catch (err) {
      console.warn(`[push] could not persist ${this.file}: ${(err as Error).message}`)
    }
  }

  get(userId: string): PushSubscription | undefined {
    return this.byUser.get(userId)
  }

  /** Users who have registered a device — the set the boot sweep reschedules. */
  subscribedUserIds(): string[] {
    return [...this.byUser.keys()]
  }

  async set(userId: string, subscription: PushSubscription): Promise<void> {
    this.byUser.set(userId, subscription)
    await this.persist()
  }

  async remove(userId: string): Promise<boolean> {
    const had = this.byUser.delete(userId)
    if (had) await this.persist()
    return had
  }

  /** Test hook: clear in-memory subscriptions and reload from the data dir. */
  async resetAndLoad(): Promise<void> {
    this.byUser.clear()
    await this.load()
  }
}

/** Singleton used by the router + scheduler (loaded at boot in app.ts). */
export const pushSubscriptionStore = new PushSubscriptionStore()