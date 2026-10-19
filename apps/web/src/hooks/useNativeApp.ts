import * as React from 'react'
import { isNativeApp } from '~/lib/native'

/**
 * Hydration-safe native-env flag (XER-320). The server and the first client
 * render both report `false` so the SSR output and initial hydration match
 * (no React mismatch on the sidebar), then flip to `true` after mount when the
 * Capacitor bridge is present — at which point the Connection nav entry is
 * dropped and /connect routes to /calendar. Cheap to run; the Capacitor
 * webview reports native so the flip is effectively immediate.
 */
export function useNativeApp(): boolean {
  const [native, setNative] = React.useState(false)
  React.useEffect(() => {
    if (isNativeApp()) setNative(true)
  }, [])
  return native
}