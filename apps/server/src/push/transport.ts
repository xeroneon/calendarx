/**
 * CalendarX push transport — the delivery seam for the reminder scheduler.
 *
 * XER-334: delivery is isolated behind a `PushTransport` interface so the
 * platform can ship with **UnifiedPush** (its own server + the app, no Google)
 * and only ever add FCM as a second transport IF the need arises. Nothing
 * upstream may call ntfy/an endpoint directly — it must go through here.
 *
 * A CalendarX server never talks to Google/FCM. The self-hosted gateway is a
 * UnifiedPush server — by default the user's own ntfy instance (a self-hosted
 * ntfy gateway, e.g. http://ntfy.example.local:2586). An app obtains a per-device
 * push endpoint from a UnifiedPush *distributor* on the phone (the ntfy app
 * itself can be one) and POSTs it to `/api/push/subscription`; this transport
 * then delivers reminder payloads to that endpoint at fire time.
 */

/** The JSON payload handed to a push endpoint (the reminder card). */
export interface PushMessage {
  /** Notification title, e.g. the event summary. */
  title: string
  /** Notification body / detail line. */
  body: string
  /**
   * Optional UTC ISO fire time. When present the transport SHOULD hold the
   * message and deliver at this instant (ntfy does this via its `X-At`
   * header). When absent the message is intended for immediate delivery — the
   * scheduler normally calls `deliver` already at fire time.
   */
  at?: string
  /** Stable calendar key for the item that produced this reminder. */
  eventKey?: string
}

/** A transport knows how to push a message to a single device endpoint. */
export interface PushTransport {
  /** Deliver `message` to `endpoint`. Must reject on an undeliverable push. */
  deliver(endpoint: string, message: PushMessage): Promise<void>
}

/** Friendly label mapping for a "visible-with-details" (ntfy) message. */
const NTFY_DEFAULT_REMINDER_BODY = 'Calendar reminder'

/**
 * UnifiedPush transport targeting a self-hosted ntfy UnifiedPush gateway.
 *
 * A ntfy UP endpoint looks like `https://<ntfy-host>/<topic>`. The gateway
 * ANSWERS `POST` to that URL: publish the JSON message and it is fanned out to
 * every device subscribed to the topic (the app's distributor feeds it into
 * the CalendarX app). This is exactly the "no Google" UnifiedPush flow: the
 * message JSON is delivered by the server's own gateway, not FCM.
 */
export class UnifiedPushTransport implements PushTransport {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async deliver(endpoint: string, message: PushMessage): Promise<void> {
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      throw new Error(`invalid unifiedpush endpoint: ${endpoint}`)
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // ntfy renders `X-Title` as the notification title even for a JSON body.
      'X-Title': message.title,
    }
    if (message.at) headers['X-At'] = new Date(message.at).toUTCString()
    const body = JSON.stringify({
      title: message.title,
      body: message.body || NTFY_DEFAULT_REMINDER_BODY,
    })
    // Wire a request-scoped timeout so a hung gateway can't stall a reminder.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    let res: Response
    try {
      res = await this.fetchImpl(endpoint, { method: 'POST', headers, body, signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      throw new Error(`unifiedpush delivery failed: HTTP ${res.status} ${res.statusText}`)
    }
  }
}

/** A transport that records deliveries (tests / dry-run) and never networks. */
export class RecordingPushTransport implements PushTransport {
  readonly deliveries: Array<{ endpoint: string; message: PushMessage }> = []
  async deliver(endpoint: string, message: PushMessage): Promise<void> {
    this.deliveries.push({ endpoint, message })
  }
}