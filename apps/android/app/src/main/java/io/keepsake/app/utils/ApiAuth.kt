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

fun applyApiToken(context: Context, connection: HttpURLConnection, target: URL) {
    val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
    val configured = prefs.getString(MainActivity.KEY_SERVER_URL, MainActivity.DEFAULT_SERVER_URL) ?: return
    val token = prefs.getString(MainActivity.KEY_API_TOKEN, null).orEmpty()
    if (token.isEmpty()) return
    if (isServerApiUrl(configured, target)) {
        connection.instanceFollowRedirects = false
        connection.setRequestProperty("Authorization", "Bearer $token")
    }
}
