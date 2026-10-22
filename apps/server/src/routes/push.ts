/**
 * CalendarX push subscription routes (XER-334, Card B).
 *
 * Behind the existing account gate (`/api/push` is requireAuth): the app
 * registers / removes the device's UnifiedPush endpoint. Only the owning
 * account touches its own subscription. The registered endpoint is what the
 * reminder scheduler POSTs reminder payloads to at fire time.
 */

import { Router, type Request, type Response } from 'express'
import { currentAuthUser } from '../auth.js'
import { pushSubscriptionStore, type PushSubscription, type PushTransportKind } from '../push/registry.js'
import { reminderScheduler } from '../push/scheduler.js'
import { rescheduleUserFromCalDav } from './calendar-and-connections.js'

export const pushRouter = Router()

/** GET /api/push/subscription — the caller's registered device (or none). */
pushRouter.get('/subscription', (_req: Request, res: Response) => {
  const user = currentAuthUser(res.req)
  const sub = user ? pushSubscriptionStore.get(user.id) : undefined
  res.json({ ok: true, data: { subscription: sub ?? null } })
})

/**
 * PUT /api/push/subscription — register (or update) the caller's UnifiedPush
 * device endpoint. Re-registering replaces the old endpoint and reschedules
 * the caller's pending reminders (target URL changed).
 */
pushRouter.put('/subscription', async (req: Request, res: Response) => {
  const user = currentAuthUser(req)
  if (!user) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'authentication required' } })
    return
  }
  const body = req.body as { transport?: PushTransportKind; endpoint?: string }
  const transport = body.transport === 'unifiedpush' ? body.transport : undefined
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  if (!transport) {
    res.status(400).json({ ok: false, error: { code: 'unsupported_transport', message: 'only unifiedpush transport is supported' } })
    return
  }
  if (!/^https?:\/\//.test(endpoint)) {
    res.status(400).json({ ok: false, error: { code: 'invalid_endpoint', message: 'endpoint must be an http(s) URL' } })
    return
  }
  const sub: PushSubscription = { transport, endpoint, updatedAt: new Date().toISOString() }
  await pushSubscriptionStore.set(user.id, sub)
  // Pull the user's calendars + items and reschedule so a freshly-registered
  // device is not left empty until the next UI load. Fire-and-forget.
  void rescheduleUserFromCalDav(user.id).catch(() => undefined)
  res.status(201).json({ ok: true, data: { subscription: sub } })
})

/** DELETE /api/push/subscription — unregister the caller's device. */
pushRouter.delete('/subscription', async (req: Request, res: Response) => {
  const user = currentAuthUser(req)
  if (!user) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'authentication required' } })
    return
  }
  const removed = await pushSubscriptionStore.remove(user.id)
  // Drop the device's armed reminders — nothing to push to anymore.
  reminderScheduler.cancelAllForUser(user.id)
  res.json({ ok: true, data: { removed } })
})