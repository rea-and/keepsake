package io.keepsake.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import java.util.regex.Pattern

class ShareActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val intent = intent
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null) {
            handleSendIntent(intent)
        } else {
            finish()
        }
    }

    private fun handleSendIntent(intent: Intent) {
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""

        val extractedUrl = extractUrl(sharedText)

        if (extractedUrl != null) {
            Toast.makeText(this, getString(R.string.saving_bookmark), Toast.LENGTH_SHORT).show()

            // Pass extracted URL and subject/title to MainActivity
            val mainIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("shared_url", extractedUrl)
                putExtra("shared_title", sharedSubject.ifEmpty { sharedText.replace(extractedUrl, "").trim() })
            }
            startActivity(mainIntent)
        } else {
            Toast.makeText(this, getString(R.string.invalid_link), Toast.LENGTH_SHORT).show()
        }

        finish()
    }

    private fun extractUrl(text: String): String? {
        val urlPattern = Pattern.compile(
            "https?://[-a-zA-Z0-9+&@#/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#/%=~_|]",
            Pattern.CASE_INSENSITIVE
        )
        val matcher = urlPattern.matcher(text)
        return if (matcher.find()) {
            matcher.group()
        } else if (text.trim().startsWith("http://") || text.trim().startsWith("https://")) {
            text.trim()
        } else {
            null
        }
    }
}
