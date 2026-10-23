import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '~/hooks/useAuth'
import { isNative, unifiedPushPlugin } from '~/lib/native'
import { registerPushSubscription, removePushSubscription } from '~/server/push'

/**
 * Native-only UnifiedPush sync (XER-335 Card C).
 *
 * The Android shell owns the UP connector; the *web* app (running inside the
 * Capacitor WebView) is the only thing that holds the authenticated session, so
 * it is the piece that turns a native device endpoint into a server-side
 * subscription (`PUT /api/push/subscription`, Card B).
 *
 * On mount (native + authed) this:
 *  1. tells the connector to ensure a distributor registration (the connector
 *     shows the per-UP-UX picker when more than one distributor is installed);
 *  2. reads whatever endpoint the connector already holds and registers it;
 *  3. subscribes to `endpointChanged` so NEW_ENDPOINT → register and
 *     UNREGISTERED → remove, live.
 *
 * It is a no-op on the plain web (no Capacitor), so the website's render is
 * untouched. Exposes `status` for a native-only status row: 'idle' | 'registering'
 * | 'registered' | 'off'.
 */
export function usePushSync(): {
  status: 'idle' | 'registering' | 'registered' | 'off' | 'no-distributor'
} {
  const qc = useQueryClient()
  const auth = useAuth()
  const [status, setStatus] = useState<
    'idle' | 'registering' | 'registered' | 'off' | 'no-distributor'
  >('idle')
  const inFlight = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (!isNative()) {
      setStatus('idle')
      return
    }
    if (auth.state !== 'authed') {
      setStatus('idle')
      return
    }
    const plugin = unifiedPushPlugin()
    if (!plugin) {
      setStatus('idle')
      return
    }

    let disposed = false
    let unsubscribeEvents: (() => void) | null = null

    // Push the given native endpoint to the server (or drop it when null).
    const sync = (endpoint: string | null | undefined) => {
      if (disposed) return
      if (!inFlight.current) {
        inFlight.current = (async () => {
          try {
            if (endpoint) {
              setStatus('registering')
              await registerPushSubscription({ data: { transport: 'unifiedpush', endpoint } })
              await qc.invalidateQueries({ queryKey: ['push'] })
              if (!disposed) setStatus('registered')
            } else {
              await removePushSubscription({ data: {} })
              if (!disposed) setStatus('off')
            }
          } catch {
            // A transient server hiccup shouldn't kill the app; leave last state.
          } finally {
            inFlight.current = null
          }
        })()
      }
    }

    // 1) ensure a distributor is selected and the connector registered (the
    //    native register() now does getDistributors → saveDistributor → register;
    //    it resolves {ok, reason, distributor}). 2) read the endpoint (existing
    //    or freshly granted) and register it. 3) watch for future changes.
    plugin
      .register()
      .then((res) => {
        if (disposed) return
        if (res && res.ok === false && res.reason === 'no_distributor') {
          setStatus('no-distributor')
          return
        }
        // Registration kicked off — read the (possibly just-granted) endpoint.
        return plugin
          .getEndpoint()
          .then(({ endpoint }) => {
            if (disposed) return
            sync(endpoint)
          })
          .catch(() => undefined)
      })
      .catch(() => undefined)
    // Even if the endpoint isn't ready yet, the endpointChanged listener below
    // picks up the eventual NEW_ENDPOINT.
    // 3) subscribe to `endpointChanged` so NEW_ENDPOINT → register and
    //    UNREGISTERED → remove, live.
    // NOTE: the native bridge's addListener returns a synchronous `{ remove }`
    // handle, NOT a Promise (this app reads the raw Capacitor.Plugins proxy —
    // it never imports @capacitor/core, whose registerPlugin is what wraps
    // addListener into a Promise). `.then` on it throws
    // "addListener(...).then is not a function". Consume the handle directly.
    const handle = plugin.addListener('endpointChanged', ({ endpoint }) => sync(endpoint))
    unsubscribeEvents = handle?.remove ?? null

    return () => {
      disposed = true
      unsubscribeEvents?.()
    }
  }, [qc, auth.state])

  return { status }
}