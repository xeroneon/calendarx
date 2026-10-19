package dev.calendarx.app

import android.content.Intent
import android.os.Bundle
import android.text.TextUtils
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Native config shell / onboarding for CalendarX.
 *
 * This is a first-class NATIVE screen (not the webview): every distributed user
 * must point the app at their own self-hosted CalendarX server, so the connect step
 * happens natively before the web app is ever loaded. The shell:
 *
 *  - Lets the user paste / type a server URL (a default demo origin is prefilled).
 *  - Runs a native "Test connection" (health check + .well-known/caldav discovery,
 *    see [ServerProbe]).
 *  - Securely persists the verified instance via EncryptedSharedPreferences.
 *  - Then launches [MainActivity], whose Capacitor webview loads that origin
 *    (reusing the existing web UI). The CalDAV account is configured in-app.
 *
 * Launch behaviour (XER-322):
 *  - First launch (no saved instance): the LAUNCHER lands here so the user enters
 *    and verifies their instance origin.
 *  - Once an instance is saved ([InstanceStore.hasInstance]), every subsequent launch
 *    goes STRAIGHT into [MainActivity] (the calendar webview) — this screen is
 *    finished before it draws, so it never flashes. Re-configuring is still possible:
 *    [MainActivity] re-launches this activity with [EXTRA_RECONFIGURE] set, which
 *    forces the setup UI to show despite an existing instance.
 */
class ConnectActivity : AppCompatActivity() {

    /**
     * When true (set by [MainActivity]'s "Change server" affordance), show the setup
     * UI even though an instance is already saved. Omitted on a normal launch.
     */
    companion object {
        const val EXTRA_RECONFIGURE = "dev.calendarx.app.reconfigure"
    }

    private lateinit var urlInput: EditText
    private lateinit var statusText: TextView
    private lateinit var testButton: Button
    private lateinit var connectButton: Button
    private lateinit var openButton: Button

    /** Last successfully verified probe result (used to persist on Connect). */
    private var lastResult: ServerProbe.Result? = null

    /** True when launched from [MainActivity] to change the saved instance (XER-322). */
    private var reconfigure = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // XER-322: once an instance is configured, a normal launch goes STRAIGHT into
        // the calendar webview — finish before drawing so the setup screen never
        // flashes. Only a reconfigure launch (from MainActivity's "Change server")
        // shows this screen again.
        reconfigure = intent?.getBooleanExtra(EXTRA_RECONFIGURE, false) ?: false
        if (InstanceStore.hasInstance(this) && !reconfigure) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_connect)

        urlInput = findViewById(R.id.server_url_input)
        statusText = findViewById(R.id.connect_status)
        testButton = findViewById(R.id.test_button)
        connectButton = findViewById(R.id.connect_button)
        openButton = findViewById(R.id.open_button)

        // Prefill: a previously saved instance, else the demo default.
        val savedUrl = InstanceStore.getServerUrl(this)
        if (!savedUrl.isNullOrEmpty()) {
            urlInput.setText(savedUrl)
            val name = InstanceStore.getServerName(this)
            statusText.text =
                getString(R.string.connect_already_configured, name ?: savedUrl)
            openButton.visibility = View.VISIBLE
        } else {
            urlInput.setText(InstanceStore.DEFAULT_DEMO_URL)
        }

        testButton.setOnClickListener { runTest() }
        connectButton.setOnClickListener { onConnect() }
        openButton.setOnClickListener {
            InstanceStore.getServerUrl(this)?.let { launchWebview() }
        }
    }

    private fun runTest() {
        val raw = urlInput.text?.toString() ?: ""
        if (TextUtils.isEmpty(raw.trim())) {
            statusText.text = getString(R.string.connect_enter_url)
            return
        }
        setBusy(true, getString(R.string.connect_testing))
        ServerProbe.test(raw.trim()) { result ->
            runOnUiThread {
                lastResult = result
                statusText.text = result.message
                connectButton.isEnabled = result.ok
                setBusy(false, null)
            }
        }
    }

    private fun onConnect() {
        val result = lastResult
        if (result == null || !result.ok || result.url == null) {
            statusText.text = getString(R.string.connect_test_first)
            return
        }
        // Persist the verified instance securely, then load the webview at it.
        InstanceStore.save(
            this,
            result.url,
            result.serverName,
            result.serverVersion,
        )
        lastResult = null
        launchWebview()
    }

    private fun launchWebview() {
        val intent = Intent(this, MainActivity::class.java)
        // Forward the reconfigure flag so an already-running (singleTask) MainActivity
        // re-reads the new instance origin instead of keeping the old one (XER-322).
        if (reconfigure) {
            intent.putExtra(EXTRA_RECONFIGURE, true)
        }
        startActivity(intent)
        finish()
    }

    private fun setBusy(busy: Boolean, busyText: String?) {
        urlInput.isEnabled = !busy
        testButton.isEnabled = !busy
        connectButton.isEnabled = !busy && lastResult?.ok == true
        if (busyText != null) statusText.text = busyText
    }
}
