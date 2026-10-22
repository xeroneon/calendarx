package dev.calendarx.app

import android.content.Context
import java.util.concurrent.CopyOnWriteArrayList

/**
 * In-memory + persisted bridge between the UnifiedPush background service and
 * the JS side (XER-335 Card C).
 *
 * The connector's [UnifiedPushService] runs in a background component and cannot
 * reach the Capacitor bridge (`notifyListeners` needs a live plugin). So the
 * service writes the current device *endpoint* here, and the plugin exposes it
 * to web → server-fn, plus emits change events. Callers can also subscribe to be
 * told the moment the endpoint changes (NEW_ENDPOINT / UNREGISTERED).
 *
 * Persistence mirrors how Card B's server expects an HTTP(S) endpoint per user:
 * the last known endpoint survives a process restart so the web side can
 * re-register it without re-solving the distributor picker.
 */
object UnifiedPushState {

    private const val PREFS = "calendarx_push"
    private const val KEY_ENDPOINT = "endpoint"

    @Volatile
    private var _endpoint: String? = null

    /** Registered device endpoint (null when not registered / after unregister). */
    @get:Synchronized val endpoint: String?
        get() = _endpoint

    private val listeners = CopyOnWriteArrayList<(String?) -> Unit>()

    /** Load last-known endpoint from disk (call once at app/service start). */
    @Synchronized
    fun load(context: Context): String? {
        _endpoint = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_ENDPOINT, null)
        return _endpoint
    }

    /**
     * Update the stored endpoint and notify subscribers. `null` means the device
     * was unregistered. Persisted so a later process restart can re-register.
     */
    @Synchronized
    fun update(context: Context, endpoint: String?) {
        _endpoint = endpoint
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .apply {
                if (endpoint == null) remove(KEY_ENDPOINT) else putString(KEY_ENDPOINT, endpoint)
            }
            .apply()
        listeners.forEach { it(endpoint) }
    }

    /** Observe endpoint changes. Returns an unsubscribe function. */
    fun subscribe(listener: (String?) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }
}