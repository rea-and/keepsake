package io.keepsake.app.models

import org.json.JSONObject

data class AuthSession(
    val name: String,
    val email: String,
    val picture: String?,
    val accessToken: String,
    val refreshToken: String?,
    val expiresAt: Long
) {
    companion object {
        fun fromJsonString(raw: String): AuthSession? {
            return try {
                val obj = JSONObject(raw)
                val user = obj.optJSONObject("user")
                val tokens = obj.optJSONObject("tokens")
                if (user != null && tokens != null) {
                    AuthSession(
                        name = user.optString("name", "Keepsake User"),
                        email = user.optString("email", ""),
                        picture = user.optString("picture").takeIf { it.isNotEmpty() && it != "null" },
                        accessToken = tokens.optString("accessToken", ""),
                        refreshToken = tokens.optString("refreshToken").takeIf { it.isNotEmpty() && it != "null" },
                        expiresAt = tokens.optLong("expiresAt", 0L)
                    )
                } else null
            } catch (e: Exception) {
                null
            }
        }
    }
}
