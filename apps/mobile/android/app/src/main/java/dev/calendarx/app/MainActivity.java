package dev.calendarx.app;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;

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
 * Reconfiguration (XER-322): the setup screen is no longer the landing, so this
 * activity adds a small floating "Change server" button that re-launches
 * {@link ConnectActivity} with {@link ConnectActivity#EXTRA_RECONFIGURE} set, so
 * the user can switch to a different instance later.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The bridge sets its own content view; layer our reconfigure button on top
        // of it so the affordance survives every launch.
        addReconfigureButton();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // XER-322: after a reconfigure round-trip the persisted origin may have
        // changed. MainActivity is singleTask, so it reaches us via onNewIntent
        // instead of a fresh onCreate — rebuild so load() reads the new origin.
        if (intent.getBooleanExtra(ConnectActivity.EXTRA_RECONFIGURE, false)) {
            recreate();
        }
    }

    private void addReconfigureButton() {
        ViewGroup root = findViewById(android.R.id.content);
        if (root == null) {
            return;
        }
        ImageButton button = new ImageButton(this);
        button.setImageResource(android.R.drawable.ic_menu_preferences);
        button.setContentDescription(getString(R.string.connect_change_server));
        button.setScaleType(ImageButton.ScaleType.CENTER_INSIDE);
        button.setPadding(dp(10), dp(10), dp(10), dp(10));

        // Translucent dark circle so it reads as an overlay, not part of the web UI.
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.argb(120, 0, 0, 0));
        button.setBackground(bg);
        button.setColorFilter(Color.WHITE);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(48), dp(48));
        lp.gravity = Gravity.TOP | Gravity.END;
        lp.setMargins(0, dp(16), dp(16), 0);
        root.addView(button, lp);

        button.setOnClickListener(v -> {
            Intent intent = new Intent(this, ConnectActivity.class);
            intent.putExtra(ConnectActivity.EXTRA_RECONFIGURE, true);
            startActivity(intent);
        });
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }

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
