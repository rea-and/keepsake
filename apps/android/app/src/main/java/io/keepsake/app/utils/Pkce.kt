package io.keepsake.app.utils

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * PKCE (RFC 7636) for the Google sign-in hand-off. The browser-side sign-in ends in a
 * keepsake:// link that any installed app could intercept, so that link carries only a
 * one-time code. Only this app knows the verifier that the server needs to redeem it.
 */
object Pkce {
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun newVerifier(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return encoder.encodeToString(bytes)
    }

    fun challengeFor(verifier: String): String =
        encoder.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
}
