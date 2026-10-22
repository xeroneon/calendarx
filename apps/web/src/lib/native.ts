/**
 * SSR-safe native (Capacitor) detection for CalendarX.
 *
 * Re-established from the XER-320 technique: apps/web is served both as a normal
 * website and inside the native Android shell's WebView. The web pushes layer
 * (XER-335) only exists natively, so components must branch on whether they are
 * actually running in Capacitor — without breaking server rendering or causing a
 * hydration mismatch.
 *
 * - `window.Capacitor` is injected by the native bridge and absent on the plain
 *   web / during SSR, so it is the discriminator.
 * - `isNative()` must be true only when the global really has a Capacitor bridge
 *   with a native platform (i.e. inside the Android app, not a loose object).
 */
type CapacitorGlobal = {
  isNativePlatform?: () => boolean
  Plugins?: Record<string, unknown>
}

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** True when running inside the native Capacitor shell. Safe on the server. */
export function isNative(): boolean {
  const cap = getCapacitor()
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

/**
 * Access the native-only `CalendarXUnifiedPush` plugin (registered in
 * MainActivity). Returns undefined on the plain web / SSR, so callers must guard
 * every use with `isNative()`.
 */
export function unifiedPushPlugin(): {
  register(opts?: object): Promise<void>
  unregister(): Promise<void>
  getEndpoint(): Promise<{ endpoint: string | null; registered: boolean; distributors: string[] }>
  hasEndpoint(): Promise<{ registered: boolean }>
  addListener(
    event: string,
    fn: (info: { endpoint?: string | null }) => void,
  ): Promise<{ remove: () => void }>
} | undefined {
  if (typeof window === 'undefined') return undefined
  const cap = getCapacitor()
  return cap?.Plugins?.CalendarXUnifiedPush as ReturnType<typeof unifiedPushPlugin> | undefined
}