package dev.calendarx.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import org.unifiedpush.android.connector.UnifiedPush

/**
 * Capacitor bridge exposing the native UnifiedPush state to the web app
 * (XER-335 Card C).
 *
 * The web app (which holds the authenticated session) uses this to:
 *  1. kick off registration with the user's UP distributor(s) — [register]
 *     calls the connector, which shows the per-UP-UX distributor picker when more
 *     than one is installed;
 *  2. read the current device endpoint and POST it to the server-fn
 *     (`PUT /api/push/subscription`, Card B) — [getEndpoint];
 *  3. observe NEW_ENDPOINT / UNREGISTERED changes via [UNIFIEDPUSH_ENDPOINT]
 *     events, then register or unregister on the server accordingly.
 *
 * It also [reRegister]s on web-app mount so an endpoint that survived a process
 * restart is re-pushed to the server without re-picking a distributor.
 */
@CapacitorPlugin(name = "CalendarXUnifiedPush")
class CalendarXUnifiedPushPlugin : Plugin() {

    private var unsubscribe: (() -> Unit)? = null

    /** Kick off registration: the connector shows the distributor picker if several. */
    @PluginMethod
    fun register(call: PluginCall) {
        val context = context.applicationContext
        UnifiedPushState.load(context)
        UnifiedPush.register(context, INSTANCE, context.getString(R.string.app_name), null)
        call.resolve()
    }

    /** Unregister the device from its distributor and clear the stored endpoint. */
    @PluginMethod
    fun unregister(call: PluginCall) {
        val context = context.applicationContext
        UnifiedPush.unregister(context, INSTANCE)
        UnifiedPushState.load(context)
        UnifiedPushState.update(context, null)
        call.resolve()
    }

    /** Return `{ endpoint, registered, distributors }` for the web side to sync. */
    @PluginMethod
    fun getEndpoint(call: PluginCall) {
        val context = context.applicationContext
        val endpoint = UnifiedPushState.load(context)
        val distributors = UnifiedPush.getDistributors(context)
        val ret = JSObject()
            .put("endpoint", endpoint ?: JSONObject.NULL)
            .put("registered", !endpoint.isNullOrEmpty())
            .put("distributors", distributors)
        call.resolve(ret)
    }

    /**
     * (Re)register the stored endpoint with the server. The web app calls this on
     * mount whenever it already has an endpoint, so a surviving endpoint is
     * re-armed on the server after a process restart — without re-picking a
     * distributor. Returns `{ registered }`.
     */
    @PluginMethod
    fun hasEndpoint(call: PluginCall) {
        val context = context.applicationContext
        val endpoint = UnifiedPushState.load(context)
        val ret = JSObject().put("registered", !endpoint.isNullOrEmpty())
        call.resolve(ret)
    }

    /** Start forwarding endpoint changes (NEW_ENDPOINT / UNREGISTERED) to JS. */
    override fun load() {
        super.load()
        val context = context.applicationContext
        UnifiedPushState.load(context)
        unsubscribe = UnifiedPushState.subscribe { endpoint ->
            val payload = JSObject().put("endpoint", endpoint ?: JSONObject.NULL)
            notifyListeners(EVENT_ENDPOINT, payload)
        }
    }

    override fun handleOnDestroy() {
        unsubscribe?.invoke()
        unsubscribe = null
        super.handleOnDestroy()
    }

    companion object {
        const val EVENT_ENDPOINT = "endpointChanged"
        const val INSTANCE = "calendarx-main"
    }
}