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
 *     selects a distributor first (the connector's `UnifiedPush.register` ONLY
 *     broadcasts REGISTER to the distributor that was ALREADY saved via
 *     `saveDistributor`; without that step nothing is ever registered and the
 *     device never gets an endpoint — the "Reminders off" state);
 *  2. read the current device endpoint and POST it to the server-fn
 *     (`PUT /api/push/subscription`, Card B) — [getEndpoint];
 *  3. observe NEW_ENDPOINT / UNREGISTERED changes via [UNIFIEDPUSH_ENDPOINT]
 *     events, then register or unregister on the server accordingly.
 *
 * It also [hasEndpoint]s on web-app mount so an endpoint that survived a process
 * restart is re-pushed to the server without re-picking a distributor.
 */
@CapacitorPlugin(name = "CalendarXUnifiedPush")
class CalendarXUnifiedPushPlugin : Plugin() {

    private var unsubscribe: (() -> Unit)? = null

    /**
     * Register the app with a UnifiedPush distributor. Selection first:
     * - 0 distributors → resolve with `{ ok:false, reason:'no_distributor' }`
     *   (the web layer shows "install a UnifiedPush distributor").
     * - exactly 1 → save it as primary, then `UnifiedPush.register`.
     * - several → use the connector's LinkActivity picker (falls back to the
     *   current/default distributor when possible).
     * Only after a distributor is saved does `UnifiedPush.register` actually
     * broadcast REGISTER and eventually deliver a NEW_ENDPOINT.
     */
    @PluginMethod
    fun register(call: PluginCall) {
        val context = context.applicationContext
        val appName = context.getString(R.string.app_name)
        UnifiedPushState.load(context)

        val distributors = UnifiedPush.getDistributors(context)
        if (distributors.isEmpty()) {
            call.resolve(
                JSObject()
                    .put("ok", false)
                    .put("reason", "no_distributor")
                    .put("distributors", distributors)
            )
            return
        }

        val saved = UnifiedPush.getSavedDistributor(context)
        if (distributors.size == 1) {
            // The single distributor is unambiguous — make it primary and register.
            UnifiedPush.saveDistributor(context, distributors[0])
            UnifiedPush.register(context, INSTANCE, appName, null)
            call.resolve(JSObject().put("ok", true).put("distributor", distributors[0]))
            return
        }

        // Multiple distributors: prefer the saved one; otherwise use the
        // connector's default-resolution (tries the current/distributor picker).
        if (saved != null && distributors.contains(saved)) {
            UnifiedPush.saveDistributor(context, saved)
            UnifiedPush.register(context, INSTANCE, appName, null)
            call.resolve(JSObject().put("ok", true).put("distributor", saved))
            return
        }

        UnifiedPush.tryUseDefaultDistributor(context) { success ->
            if (success) {
                UnifiedPush.register(context, INSTANCE, appName, null)
            }
            call.resolve(
                JSObject()
                    .put("ok", success)
                    .put("reason", if (success) null else "pick_required")
                    .put("distributors", distributors)
            )
        }
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