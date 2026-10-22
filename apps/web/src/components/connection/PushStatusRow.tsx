import * as React from 'react'
import { usePushSync } from '~/hooks/usePushSync'
import { isNative } from '~/lib/native'

const LABEL: Record<'idle' | 'registering' | 'registered' | 'off', { text: string; tone: string }> = {
  idle: { text: '—', tone: 'muted' },
  registering: { text: 'Registering…', tone: 'muted' },
  registered: { text: 'Reminders on this device', tone: 'ok' },
  off: { text: 'Reminders off', tone: 'muted' },
}

/**
 * Native-only UnifiedPush status row (XER-335 Card C). Shown only inside the
 * Capacitor shell; completely hidden on the plain web / SSR. Tells a self-hoster
 * what the app is doing with their reminder pushes (see docs/push-notifications.md).
 *
 * Hydration-safe: `window.Capacitor` exists only on the client, so reading it
 * during render would diverge SSR (null) from the first client render (row). We
 * return nothing on the server / first client render and flip to the row in a
 * mount effect (same pattern as XER-320's useNativeApp).
 */
export function PushStatusRow(): React.ReactElement | null {
  const { status } = usePushSync()
  const [native, setNative] = React.useState(false)

  React.useEffect(() => {
    if (isNative()) setNative(true)
  }, [])

  if (!native) return null
  const s = LABEL[status] ?? LABEL.idle
  return (
    <div className="cl-conn-row">
      <div className="cl-conn-row-label">
        Push notifications
        <span className={`cl-badge ${s.tone === 'ok' ? 'cl-badge-ok' : ''}`}>{s.text}</span>
      </div>
      <div className="cl-conn-row-sub">
        Delivered via UnifiedPush (your own server) — no Google. Install a UnifiedPush
        distributor (e.g. the ntfy app) to receive reminders.
      </div>
    </div>
  )
}