/**
 * Runtime detection of the Capacitor/Android native environment (XER-320).
 *
 * The mobile shell (`apps/mobile`) loads the deployed web app over HTTPS via
 * `server.url`. At runtime the Capacitor bridge exposes a `window.Capacitor`
 * global with an `isNativePlatform()` method — when that is present and true
 * we are inside the Android webview, where the connection-setup surface is
 * redundant (connections live per-account on the server, XER-316) and should
 * be hidden so login lands straight on the calendar.
 *
 * The global accessor stays SSR-safe (returns undefined outside a browser)
 * and the pure predicate `isNativeCapacitor` is unit-testable under node.
 */

export interface CapacitorLike {
  isNativePlatform?: () => boolean
}

/** True when `cap` looks like a Capacitor native bridge reporting native. */
export function isNativeCapacitor(cap: unknown): boolean {
  const c = cap as CapacitorLike | null | undefined
  return Boolean(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
}

/** Read the Capacitor bridge global, or undefined outside a browser. */
export function getCapacitorGlobal(): CapacitorLike | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as { Capacitor?: CapacitorLike }).Capacitor
}

/** Synchronous check: are we running inside the Capacitor/Android webview? */
export function isNativeApp(): boolean {
  return isNativeCapacitor(getCapacitorGlobal())
}