/**
 * Push subscription server functions (XER-334, Card B).
 *
 * The web app relays the browser's `cx_session` cookie and lets the signed-in
 * account register / remove its UnifiedPush device endpoint on the CalendarX
 * server (which delivers reminders at fire time). These are called by the
 * mobile app (or the web settings) when a UnifiedPush distributor yields a
 * device endpoint.
 */
import { createServerFn } from '@tanstack/react-start'
import type { PushSubscription, PushTransportKind } from '@calendarx/sdk'
import { clientFor } from './api'

/** Read the caller's registered device subscription (or null). */
export const getPushSubscription = createServerFn({ method: 'GET' })
  .validator((d: Record<string, never>) => d)
  .handler(async (): Promise<PushSubscription | null> => {
    const { subscription } = await clientFor().push.status()
    return subscription
  })

/** Register (or update) the caller's UnifiedPush device endpoint. */
export const registerPushSubscription = createServerFn({ method: 'POST' })
  .validator((d: { transport: PushTransportKind; endpoint: string }) => d)
  .handler(async ({ data }): Promise<PushSubscription> => {
    const { subscription } = await clientFor().push.register(data.transport, data.endpoint)
    return subscription
  })

/** Unregister the caller's device (stops server-side reminder delivery). */
export const removePushSubscription = createServerFn({ method: 'POST' })
  .validator((d: Record<string, never>) => d)
  .handler(async (): Promise<boolean> => {
    const { removed } = await clientFor().push.remove()
    return removed
  })