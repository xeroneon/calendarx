package dev.calendarx.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * CalendarX notification foundation (XER-333 Card A).
 *
 * Owns the single notification channel the app (and Card C's UnifiedPush-received
 * messages) post to, plus the runtime POST_NOTIFICATIONS permission (Android 13+).
 *
 * `event-reminders` — channel id is stable so the web layer, the @capacitor/
 * local-notifications plugin, and the UnifiedPush arrival path (Card C) all target
 * the SAME channel. Created eagerly at MainActivity launch (idempotent) so it always
 * exists before any reminder arrives.
 */
object NotificationChannels {

    /** Stable channel that all CalendarX reminders / push messages display on. */
    const val EVENT_REMINDERS = "event-reminders"

    /** Small status-bar icon (white glyph, Android uses it as an alpha mask). */
    val ICON = R.drawable.ic_stat_calendar

    /**
     * Ensure the `event-reminders` channel exists (no-op if already created).
     * Safe to call from any context; on API < 26 there are no channels to create.
     */
    @JvmStatic
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE)
                as? NotificationManager ?: return
        if (manager.getNotificationChannel(EVENT_REMINDERS) != null) return

        val channel = NotificationChannel(
            EVENT_REMINDERS,
            context.getString(R.string.notification_channel_event_reminders),
            NotificationManager.IMPORTANCE_HIGH // pop heads-up for reminders
        ).apply {
            description = context.getString(R.string.notification_channel_event_reminders_desc)
            // CalendarX has no custom sound asset; use the system default. Small-icon
            // stays monochrome (setShowBadge is true by default).
            setShowBadge(true)
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * Whether the runtime POST_NOTIFICATIONS permission is already granted.
     * Always true on API < 33 (no runtime permission exists there).
     */
    @JvmStatic
    fun hasNotificationPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Request the POST_NOTIFICATIONS runtime permission if not already granted.
     * Called at a "natural moment" (first MainActivity launch / first reminder set),
     * never at first install. The result is delivered via the activity's
     * onRequestPermissionsResult.
     */
    @JvmStatic
    fun requestNotificationPermission(activity: Activity) {
        if (hasNotificationPermission(activity)) {
            // Channel may not have been created yet on a cold start that never hit
            // MainActivity — ensure it whenever we grant-complete or already hold it.
            ensureChannel(activity)
            return
        }
        ActivityCompat.requestPermissions(
            activity,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            PERMISSION_REQUEST_POST_NOTIFICATIONS
        )
    }

    const val PERMISSION_REQUEST_POST_NOTIFICATIONS = 4201
}