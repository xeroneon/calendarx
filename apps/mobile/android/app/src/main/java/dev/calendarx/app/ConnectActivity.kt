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
 */
class ConnectActivity : AppCompatActivity() {

    private lateinit var urlInput: EditText
    private lateinit var statusText: TextView
    private lateinit var testButton: Button
    private lateinit var connectButton: Button
    private lateinit var openButton: Button

    /** Last successfully verified probe result (used to persist on Connect). */
    private var lastResult: ServerProbe.Result? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    private fun setBusy(busy: Boolean, busyText: String?) {
        urlInput.isEnabled = !busy
        testButton.isEnabled = !busy
        connectButton.isEnabled = !busy && lastResult?.ok == true
        if (busyText != null) statusText.text = busyText
    }
}
