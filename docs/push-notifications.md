# CalendarX Push Notifications (UnifiedPush, no Google)

This document is written for someone standing up CalendarX on their **own
server** who wants reminder notifications to reach their phone. You do **not**
need Firebase/Google. CalendarX delivers reminders over **UnifiedPush**, a
Google-free, self-hosted push protocol.

> **Force-stop caveat (read this first):** no self-hosted push can wake a phone
> after you *force-stop* the app or after a reboot before the app is opened.
> FCM (Google) is the only channel Android lets run in that state. With
> UnifiedPush the notification appears as long as the app (or its distributor)
> has an active connection. Don't force-stop CalendarX and expect reminders to
> push — the same is true of every self-hosted messenger.

---

## What CalendarX does with push

- The Android app talks to a **UnifiedPush distributor** on the phone (the ntfy
  app can be one) and gets back a per-device **push endpoint**.
- The app sends that endpoint to your CalendarX server
  (`PUT /api/push/subscription`, behind the normal account login).
- CalendarX computes reminder fire times (`event start − alarm trigger`) from
  the user's CalDAV data and, at each fire time, **POSTs the reminder JSON** to
  that endpoint.
- The distributor wakes the app (or shows a branded notification) — no Google
  involved at any step.

Your server holds the registry of device endpoints and does the delivery. That
is exactly why this is "your own server does the push."

---

## (a) Stand up a UnifiedPush gateway on your own server

A **UnifiedPush gateway** is the component that receives a push from a server
and forwards it to the phone. CalendarX's reference gateway is
[**ntfy**](https://docs.ntfy.sh/) because it is tiny, self-hosted, and doubles
as an app + a UP **distributor**.

### Option 1 — ntfy (recommended, and CalendarX's dev reference)

Run ntfy with the **UnifiedPush** feature enabled:

```yaml
# docker-compose.yml
services:
  ntfy:
    image: binwiederhier/ntfy
    container_name: ntfy
    restart: unless-stopped
    ports:
      - "2586:80"          # plain http on your LAN
      # - "8443:80"        # or put it behind your TLS reverse proxy
    volumes:
      - ./data:/var/lib/ntfy
    environment:
      - NTFY_ENABLE_UNIFIEDPUSH=1   # <-- make it a UP gateway
```

Start it, then confirm it answers on its base URL and that
`NTFY_ENABLE_UNIFIEDPUSH=1` is set. The CalendarX dev install runs ntfy on the
host's port 2586 (self-hoster picks their own host/URL).

> The topic URL *is* a valid UnifiedPush endpoint: `https://your-host/<topic>`.
> Only devices that know that topic receive its pushes, so use a random,
> unguessable topic per device (the distributor generates it).

### Option 2 — any generic UP push server

UnifiedPush is an open spec. Any server implementing the
[UnifiedPush HTTP push spec](https://unifiedpush.org/spec/definitions/) can be
used — since CalendarX only ever does an HTTP `POST` of a JSON body to the
endpoint the app registers, it doesn't care which specific server it is, as
long as the phone's distributor can talk to it too.

---

## (b) Install a UnifiedPush distributor on the phone

A **distributor** is the app that holds the connection to your gateway and
hands other apps a push endpoint. The **ntfy app** is one; others
(e.g. UnifiedPush-only distributors like `Updroid`) also work.

Android:
1. Install the **ntfy** app (F-Droid) — it can act as your distributor. Do
   **not** force-stop it; it must keep its connection to your gateway.
2. In ntfy, enable "UnifiedPush" so it exposes endpoints to apps that request
   them.

iOS: UnifiedPush works via ntfy as well (the ntfy iOS app), with the same
model.

Now CalendarX (or your other UnifiedPush-capable apps) can call the distributor,
receive a per-device endpoint like `https://your-host/<random-topic>`, and
register it on your server.

---

## (c) Point the server at your gateway

CalendarX itself needs **no gateway address** in most setups: the *app* fetches
the endpoint from the distributor and registers it against the server. The
server just POSTs to whatever endpoint the app registered.

The only server setting you may want is the **reminder horizon** — how far out
it looks for alarms to schedule:

```
# .run-3101.env (CalendarX thin server env)
# Optional: how many ms of upcoming events to schedule pushes for.
# Default: 7 days. Raise it to push reminders further ahead, lower to keep
# less in flight.
CALENDARX_REMINDER_HORIZON_MS=604800000
```

That's it — no Google keys, no firebase config, nothing to whitelist.

---

## (d) The full flow, end to end

1. User installs CalendarX on Android + a UP distributor (ntfy).
2. CalendarX app asks the distributor for its UnifiedPush endpoint.
3. App logs into the CalendarX account and registers the endpoint:
   `PUT /api/push/subscription  { "transport": "unifiedpush", "endpoint": "https://your-host/<topic>" }`.
4. CalendarX server stores the endpoint keyed to the user (registry survives
   restarts, in `push-subscriptions.json` under the data dir).
5. When the user's CalDAV data materializes (calendar loads / event edited),
   the server computes fire times for the next horizon and arms one delivery
   per alarm, deduped by (event uid, occurrence start, alarm minutes).
6. At each fire time the server POSTs the reminder JSON
   (`{ "title", "body", ... }`) to the endpoint. Editing/deleting/completing
   the event cancels that item's armed reminders so no ghost notification fires.
7. The distributor forwards it to the phone with as much on-time guaratee as
   the OS allows — no Google.

If a device is removed (or the user logs out), `DELETE /api/push/subscription`
unregisters it and the server cancels its pending deliveries.

---

## (e) The Android app — what actually happens on-device

This is the client side (Card C, XER-335). On the phone:

- **The app embeds the official UnifiedPush connector** (`org.unifiedpush.android:
  connector`) as a runtime service. This is what lets CalendarX *receive* pushes
  from any distributor — it never depends on Google/FCM.
- **Choosing a distributor (the picker):** the connector implements the UP UX
  spec's distributor picker. When you open the app and it registers for push, if
  you have exactly one UnifiedPush distributor installed (e.g. the ntfy app) it
  uses that one silently. If you have several, it shows the UP picker so you
  choose which one delivers CalendarX's reminders. If you have none, the picker
  points you at installing one.
- **Endpoint → your server:** when the chosen distributor hands the app a
  per-device endpoint, the app stores it and — because it is signed into your
  account in-app — automatically calls `PUT /api/push/subscription` with it. The
  server now holds your device's endpoint and can push to it.
- **What you see, day to day:** the **Connection** (settings) screen shows a
  native-only **"Push notifications"** status row: `Reminders on this device`,
  `Registering…`, or `Reminders off`, plus a reminder to install a distributor.
  Recalling a reminder is a normal Android notification titled with the event
  summary, on the **"Event reminders"** channel — tapping it opens the calendar.
  (Tap-to-open scrolls to the event only when the deep link is implemented;
  today it opens the calendar surface.)
- **Unregistering:** removing the device, clearing app data, or the user
  unregistering in a placed notification stops it — the stored endpoint is cleared
  and the server's copy is removed via `DELETE /api/push/subscription`.

### Self-hoster checklist (first phone)

1. **Stand up the gateway** (section (a)) and make sure your server `CALENDARX_
   REMINDER_HORIZON_MS` (optional; default 7 days) covers how far ahead you want
   reminders.
2. **Install a UP distributor on the phone** — the ntfy app (F-Droid) is the
   reference; enable its "UnifiedPush" option. Keep it running (don't force-stop).
3. **Install CalendarX** (the Obtainium/APK build) and connect it to your server
   + log in.
4. The app registers with the distributor (silent if you have one, picker if
   several / none) and the server starts receiving the endpoint. You're done —
   reminders push to the phone on time.

> **Gotcha:** on-device push delivery lives in the **Android** app (the native
> shell + connector). The plain web app (a browser) does not connect to a
> distributor, so those reminders only surface on the phone. On the web, the
> same `event-reminders` design applies if you run it with its own push channel;
> the common setup is Android-only (sections (b) + (d)).

---

## Why no Google

UnifiedPush keeps the whole chain on infrastructure **you control**: your
gateway, your server, your data. FCM would route every reminder through Google
and add explicit dependency on a third party. This matches CalendarX's
self-hosted-first stance (your CalDAV data stays yours too). The one real
trade-off is the force-stop / reboot caveat above.

---

## Transport architecture

Delivery is isolated behind a `PushTransport` interface
(`apps/server/src/push/transport.ts`). Today there is exactly one
implementation, `UnifiedPushTransport` (POST JSON to the registered endpoint).
If a future deployment ever *wants* FCM, it can be added as a second transport
behind that same interface — the scheduler, registry, and routes don't change.