import { Navigate, createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/components/AuthGate'
import { ConnectionScreen } from '~/components/connection/ConnectionScreen'
import { isNativeApp } from '~/lib/native'

export const Route = createFileRoute('/connect')({
  component: () => (
    <AuthGate>
      <NativeConnectGuard />
    </AuthGate>
  ),
})

/**
 * In the Capacitor/Android app the CalDAV connection is per-account on the
 * server (XER-316), so there is no on-device setup to do — a resolved /connect
 * bounces straight to the calendar and the setup surface is unreachable (XER-320).
 * Reached only via client-side navigation in the webview, so the synchronous
 * `isNativeApp()` check is reliable here.
 */
function NativeConnectGuard(): React.ReactElement {
  if (isNativeApp()) return <Navigate to="/calendar" />
  return (
    <div className="cl-connect-wrap">
      <ConnectionScreen />
    </div>
  )
}