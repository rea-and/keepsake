package io.keepsake.app.utils

import android.content.Context
import io.keepsake.app.MainActivity
import java.net.HttpURLConnection
import java.net.URL

fun isServerApiUrl(configured: String, target: URL): Boolean = try {
    val server = URL(configured)
    val basePath = server.path.trimEnd('/') + "/api/"
    target.protocol == server.protocol && target.host.equals(server.host, ignoreCase = true) && target.port == server.port && target.path.startsWith(basePath)
} catch (_: Exception) { false }

/**
 * The session token is a bearer credential, so it only goes over https, or over plain http
 * to this device and private networks (a home server on the LAN, an emulator host, Tailscale).
 */
fun isTokenSafeTransport(target: URL): Boolean {
    if (target.protocol.equals("https", ignoreCase = true)) return true
    if (!target.protocol.equals("http", ignoreCase = true)) return false
    val host = target.host.lowercase().removePrefix("[").removeSuffix("]")
    if (host == "localhost" || host == "::1" || host.endsWith(".local")) return true
    val parts = host.split(".")
    if (parts.size != 4) return false
    val octets = parts.map { it.toIntOrNull() ?: return false }
    if (octets.any { it !in 0..255 }) return false
    val (a, b) = octets
    return a == 127 || a == 10 || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 169 && b == 254) || (a == 100 && b in 64..127)
}

fun applyApiToken(context: Context, connection: HttpURLConnection, target: URL) {
    val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
    val configured = prefs.getString(MainActivity.KEY_SERVER_URL, MainActivity.DEFAULT_SERVER_URL) ?: return
    val token = prefs.getString(MainActivity.KEY_API_TOKEN, null).orEmpty()
    if (token.isEmpty()) return
    if (isServerApiUrl(configured, target) && isTokenSafeTransport(target)) {
        connection.instanceFollowRedirects = false
        connection.setRequestProperty("Authorization", "Bearer $token")
    }
}
