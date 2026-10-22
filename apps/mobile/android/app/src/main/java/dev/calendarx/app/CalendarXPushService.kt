package dev.calendarx.app

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONObject
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

/**
 * CalendarX UnifiedPush message service (XER-335 Card C).
 *
 * This is the app's UnifiedPush *connector endpoint*. The distributor (ntfy app,
 * Updroid, etc.) delivers every reminder push here. We:
 *
 *  - **[onMessage]** turn the push payload (`{title, body, eventKey}` from Card B's
 *    scheduler) into a native notification on the `event-reminders` channel
 *    (Card A). A tap opens [MainActivity] (the calendar); the originating
 *    `eventKey` rides along as an intent extra so the web app could deep-link to
 *    that event (optional, user's Q2).
 *  - **[onNewEndpoint]** record the per-device endpoint and hand it to JS (via
 *    [UnifiedPushState]) so the web server-fn can `PUT /api/push/subscription`.
 *  - **[onUnregistered]** clear the stored endpoint (the server should also
 *    `DELETE` its copy — the web layer observes the same state change).
 *
 * The connector handles every intent in the spec (NEW_ENDPOINT /
 * REGISTRATION_FAILED / UNREGISTERED / MESSAGE) internally via its
 * `MessagingReceiverImpl` and routes to these callbacks; this class only needs
 * the `<service>` declaration in the manifest with the `PUSH_EVENT` filter.
 */
class CalendarXPushService : PushService() {

    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        Log.d(TAG, "UnifiedPush new endpoint (instance=$instance): ${endpoint.url}")
        UnifiedPushState.load(this)
        UnifiedPushState.update(this, endpoint.url)
    }

    override fun onMessage(message: PushMessage, instance: String) {
        val payload = String(message.content ?: ByteArray(0), Charsets.UTF_8)
        val parsed = runCatching { JSONObject(payload) }.getOrNull()
        val title = parsed?.optString("title")?.takeIf { it.isNotBlank() }
            ?: getString(R.string.notification_default_title)
        val body = parsed?.optString("body")?.takeIf { it.isNotBlank() }
            ?: getString(R.string.notification_default_body)
        val eventKey = parsed?.optString("eventKey")?.takeIf { it.isNotBlank() }
        Log.d(TAG, "UnifiedPush message: $title")
        showReminderNotification(this, title, body, eventKey)
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        Log.w(TAG, "UnifiedPush registration failed ($instance): $reason")
        // No distributor reachable/usable — keep the last endpoint cleared so a
        // later successful registration is what the server sees.
    }

    override fun onUnregistered(instance: String) {
        Log.d(TAG, "UnifiedPush unregistered ($instance)")
        UnifiedPushState.load(this)
        UnifiedPushState.update(this, null)
    }

    companion object {
        private const val TAG = "CalendarXPush"

        /**
         * Build and post the visible reminder. Reused by the JS bridge test path and
         * any future FCM transport; the channel + icon come from Card A.
         */
        fun showReminderNotification(context: Context, title: String, body: String, eventKey: String?) {
            NotificationChannels.ensureChannel(context)
            if (!NotificationChannels.hasNotificationPermission(context)) return

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                if (eventKey != null) putExtra(EXTRA_EVENT_KEY, eventKey)
            }
            val pi = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val notification: Notification =
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    Notification.Builder(context, NotificationChannels.EVENT_REMINDERS)
                } else {
                    @Suppress("DEPRECATION")
                    Notification.Builder(context)
                }
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(NotificationChannels.ICON)
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .setDefaults(Notification.DEFAULT_ALL)
                    .build()

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE)
                    as android.app.NotificationManager
            // Reuse the tag per event so repeated nudges to the same event replace
            // each other instead of stacking; null tag → rotating id.
            if (eventKey != null) {
                nm.notify(TAG, eventKey.hashCode(), notification)
            } else {
                nm.notify((System.currentTimeMillis() and 0x7fffffff).toInt(), notification)
            }
        }

        const val EXTRA_EVENT_KEY = "calendarx_event_key"
    }
}