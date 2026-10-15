/**
 * Passthrough call wrapper for CalendarX.
 *
 * The cloud original interposed a browser-side 401→refresh→retry on the
 * server-fn RPC. CalendarX moves auth server-side (the CalDAV proxy holds the
 * upstream credential), so the client has nothing to refresh — this simply
 * invokes the server function. Keeping the same call site (`authCall(() =>
 * fn(...))`) means the extracted CalendarBrowser UI works unchanged while any
 * future client-side auth (e.g. a session cookie for the proxy) can be layered
 * back in here.
 */
export function authCall<T>(fn: () => Promise<T>): Promise<T> {
  return fn()
}