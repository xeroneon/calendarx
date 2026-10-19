package dev.calendarx.app;

import android.net.Uri;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

/**
 * CalendarX host activity — hosts the Capacitor (WebView) UI for the instance the
 * user connected to in {@link ConnectActivity}.
 *
 * The Capacitor config ships with a baked default origin so a bare
 * "cap sync" still produces a live app, but at runtime the WebView is pointed at
 * the user's securely-persisted self-hosted instance (EncryptedSharedPreferences,
 * see {@link InstanceStore}). We build a {@link CapConfig} with that server URL
 * before the bridge loads so the SPA is served from the chosen origin — reusing
 * the full web UI for a distributed, self-hosted audience.
 *
 * There is deliberately NO in-app affordance back to the native setup screen
 * (XER-322): after first connect the app always lands here, straight into the
 * calendar. If an instance ever needs re-configuring, clearing the app's data
 * (which wipes InstanceStore's EncryptedSharedPreferences) returns the next
 * launch to {@link ConnectActivity}.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void load() {
        String serverUrl = InstanceStore.getServerUrl(this);
        if (serverUrl != null && !serverUrl.isEmpty()) {
            // Point the Capacitor WebView at the user's chosen instance.
            CapConfig.Builder builder = new CapConfig.Builder(this);
            builder.setServerUrl(serverUrl);
            // Allow in-app navigation within the persisted origin (deep links,
            // router pushes) so SPA routing works without bouncing to the browser.
            String host = Uri.parse(serverUrl).getHost();
            if (host != null) {
                builder.setAllowNavigation(new String[]{host});
            }
            this.config = builder.create();
        }
        super.load();
    }
}
