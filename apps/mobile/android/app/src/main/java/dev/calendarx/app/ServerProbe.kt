package dev.calendarx.app

import android.net.Uri
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Native "Test connection" probe for the CalendarX connect shell.
 *
 * It validates that the entered URL is a reachable, healthy CalendarX server:
 *  1. Normalizes the entry (scheme, trailing slash).
 *  2. GET  /api/health  — must return {ok:true, data:{name:"calendarx", ...}}.
 *  3. GET  /.well-known/caldav  — informational CalDAV endpoint discovery at the
 *     origin (non-blocking: many deployments proxy CalDAV on a separate host, so a
 *     miss is reported as a hint, never a failure).
 *
 * Runs off the caller thread; results are delivered on [onDone]. Both network calls
 * are bounded by a short connect/read timeout so a dead host fails fast.
 */
object ServerProbe {

    data class Result(
        val ok: Boolean,
        val url: String? = null,
        val serverName: String? = null,
        val serverVersion: String? = null,
        val caldavEndpoint: String? = null,
        val message: String,
    )

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    fun test(rawUrl: String, onDone: (Result) -> Unit) {
        executor.execute {
            var result = probe(rawUrl)
            if (result.ok) {
                // Probe from the caller thread context is fine; report on main.
            }
            onDone(result)
        }
    }

    internal fun probe(rawUrl: String): Result {
        val normalized = normalize(rawUrl)
            ?: return Result(ok = false, message = "Not a valid URL. Include https:// (e.g. https://calendar.xeroneon.dev).")
        val healthUrl = "${trimSlash(normalized)}/api/health"

        // Network config default allows HTTPS + localhost; keep timeouts short.
        val health = httpGetJson(healthUrl, 10_000) ?: return Result(
            ok = false,
            url = normalized,
            message = "Could not reach $healthUrl. Check the URL and your connection.",
        )

        val ok = health.optBoolean("ok", false)
        if (!ok) {
            return Result(ok = false, url = normalized, message = "Reached the server but /api/health reported not ok.")
        }
        val data = health.optJSONObject("data") ?: JSONObject()
        val serverName = data.optString("name").takeIf { it.isNotEmpty() }
            ?: data.optString("service").takeIf { it.isNotEmpty() }
        val version = data.optString("version").takeIf { it.isNotEmpty() }
        if (serverName != null && serverName != "calendarx") {
            return Result(
                ok = false,
                url = normalized,
                message = "That server is '$serverName', not a CalendarX instance.",
            )
        }

        // Informational CalDAV discovery at the origin. Non-blocking.
        val caldav = discoverCaldav(normalized)
        val message = "CalendarX server reachable${version?.let { " (v$it)" } ?: ""}." +
            (caldav?.let { "\nCalDAV endpoint: $it" } ?: "\nNo CalDAV endpoint advertised at origin (fine — configure inside the app).")

        return Result(
            ok = true,
            url = normalized,
            serverName = serverName,
            serverVersion = version,
            caldavEndpoint = caldav,
            message = message,
        )
    }

    /** Normalize a user-typed URL to an https origin (or keep http for local/private hosts). */
    private fun normalize(raw: String): String? {
        var s = raw.trim()
        if (s.isEmpty()) return null
        if (!s.contains("://")) {
            s = "https://$s"
        }
        val uri = try {
            Uri.parse(s)
        } catch (_: Exception) {
            return null
        }
        val scheme = uri.scheme ?: return null
        val host = uri.host ?: return null
        if (scheme != "http" && scheme != "https") return null
        val port = uri.port
        return buildString {
            append(scheme).append("://").append(host)
            if (port != -1) append(":").append(port)
        }
    }

    private fun trimSlash(s: String): String = s.trimEnd('/')

    /** Follows .well-known/caldav redirects and reads the final Location/URL. */
    private fun discoverCaldav(origin: String): String? {
        val url = "${origin}/.well-known/caldav"
        return try {
            val conn = open(url, 8_000)
            conn.instanceFollowRedirects = true
            val code = conn.responseCode
            if (code in 200..399) {
                val loc = conn.getHeaderField("Location")
                if (!loc.isNullOrEmpty()) loc else url
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun httpGetJson(url: String, timeoutMs: Int): JSONObject? {
        return try {
            val conn = open(url, timeoutMs)
            val status = conn.responseCode
            if (status !in 200..399) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            JSONObject(body)
        } catch (_: Exception) {
            null
        }
    }

    private fun open(url: String, timeoutMs: Int): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = timeoutMs
        c.readTimeout = timeoutMs
        c.requestMethod = "GET"
        c.setRequestProperty("Accept", "application/json,text/plain")
        return c
    }
}
