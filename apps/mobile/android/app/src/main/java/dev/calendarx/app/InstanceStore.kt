package dev.calendarx.app

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Secure, encrypted persistence for the user's chosen CalendarX instance (the
 * self-hosted server origin the web app is loaded from).
 *
 * The server URL is the ONLY thing stored here — the CalDAV account credentials
 * (username/password) are never typed or stored on the device natively; they are
 * handled inside the web app's own connection screen once the webview loads.
 *
 * Backed by EncryptedSharedPreferences (AES256_GCM master key in the Android
 * Keystore), so at rest the instance URL is not recoverable from a plain backup
 * / DataExtractionRules read.
 */
object InstanceStore {

    private const val PREFS_NAME = "calendarx_instance"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_SERVER_NAME = "server_name"
    private const val KEY_SERVER_VERSION = "server_version"
    private const val KEY_VERIFIED_AT = "verified_at"

    /**
     * The canonical demo / quick-start origin. Users replace this with their own
     * self-hosted CalendarX server URL. The backend default is a Radicale CalDAV
     * server, but the connect screen is CalDAV-generic.
     */
    const val DEFAULT_DEMO_URL = "https://calendar.xeroneon.dev"

    @JvmStatic
    fun getServerUrl(context: Context): String? = prefs(context).getString(KEY_SERVER_URL, null)

    @JvmStatic
    fun getServerName(context: Context): String? = prefs(context).getString(KEY_SERVER_NAME, null)

    @JvmStatic
    fun getServerVersion(context: Context): String? = prefs(context).getString(KEY_SERVER_VERSION, null)

    @JvmStatic
    fun hasInstance(context: Context): Boolean = !getServerUrl(context).isNullOrEmpty()

    /**
     * Persist a verified instance. Passing a null [name]/[version] records them as
     * the canonical demo defaults when omitted.
     */
    @JvmStatic
    fun save(context: Context, url: String, name: String?, version: String?) {
        prefs(context)
            .edit()
            .putString(KEY_SERVER_URL, url)
            .putString(KEY_SERVER_NAME, name)
            .putString(KEY_SERVER_VERSION, version)
            .putLong(KEY_VERIFIED_AT, System.currentTimeMillis())
            .apply()
    }

    @JvmStatic
    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }

    @JvmStatic
    fun verifiedAt(context: Context): Long = prefs(context).getLong(KEY_VERIFIED_AT, 0L)

    private fun prefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }
}
