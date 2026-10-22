package io.keepsake.app.utils

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.widget.ImageView
import kotlinx.coroutines.*
import java.net.HttpURLConnection
import java.net.URL

object ImageLoader {

    private val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
    private val cacheSize = maxMemory / 8

    private val memoryCache = object : LruCache<String, Bitmap>(cacheSize) {
        override fun sizeOf(key: String, bitmap: Bitmap): Int {
            return bitmap.byteCount / 1024
        }
    }

    fun load(imageView: ImageView, urlString: String?, placeholderRes: Int? = null) {
        if (urlString.isNullOrEmpty()) {
            if (placeholderRes != null) {
                imageView.setImageResource(placeholderRes)
            } else {
                imageView.setImageDrawable(null)
            }
            return
        }

        val targetUrl = cleanUrl(urlString)

        // Check cache first (by sanitized and raw URL)
        val cached = memoryCache.get(targetUrl) ?: memoryCache.get(urlString)
        if (cached != null) {
            imageView.setImageBitmap(cached)
            return
        }

        if (placeholderRes != null) {
            imageView.setImageResource(placeholderRes)
        } else {
            imageView.setImageDrawable(null)
        }

        imageView.tag = targetUrl

        CoroutineScope(Dispatchers.IO).launch {
            val bitmap = downloadBitmap(targetUrl)
            if (bitmap != null) {
                memoryCache.put(targetUrl, bitmap)
                memoryCache.put(urlString, bitmap)
                withContext(Dispatchers.Main) {
                    if (imageView.tag == targetUrl) {
                        imageView.setImageBitmap(bitmap)
                    }
                }
            }
        }
    }

    private fun cleanUrl(rawUrl: String): String {
        var url = rawUrl.trim()
        url = url.replace(Regex("&quot;.*$"), "")
        url = url.replace(Regex("&gt;.*$"), "")
        url = url.trim('\'', '"')
        while (url.contains("&amp;")) {
            url = url.replace("&amp;", "&")
        }

        // Handle Reddit wrapper: /media?url=...
        if (url.contains("/media?") || url.contains("/media/")) {
            try {
                val matcher = java.util.regex.Pattern.compile("[?&]url=([^&]+)").matcher(url)
                if (matcher.find()) {
                    url = java.net.URLDecoder.decode(matcher.group(1), "UTF-8")
                    while (url.contains("&amp;")) {
                        url = url.replace("&amp;", "&")
                    }
                }
            } catch (_: Exception) {}
        }

        val extMatch = Regex("https://preview\\.redd\\.it/([a-zA-Z0-9_\\-\\.]+)\\.(jpe?g|png|webp|gif)", RegexOption.IGNORE_CASE).find(url)
        if (extMatch != null) {
            return "https://i.redd.it/${extMatch.groupValues[1]}.${extMatch.groupValues[2]}"
        }

        val noExtMatch = Regex("https://preview\\.redd\\.it/([a-zA-Z0-9_\\-]+)\\?(?:[^\"'\\s]*&)?format=(p?jpe?g|png|webp|gif)", RegexOption.IGNORE_CASE).find(url)
        if (noExtMatch != null) {
            val ext = if (noExtMatch.groupValues[2].equals("pjpg", ignoreCase = true)) "jpg" else noExtMatch.groupValues[2].lowercase()
            return "https://i.redd.it/${noExtMatch.groupValues[1]}.$ext"
        }

        return url
    }

    private fun downloadBitmap(urlString: String): Bitmap? {
        val sanitized = cleanUrl(urlString)
        var conn: HttpURLConnection? = null
        return try {
            val url = URL(sanitized)
            conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            conn.setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")

            conn.connect()
            if (conn.responseCode in 200..299) {
                val options = BitmapFactory.Options().apply {
                    inPreferredConfig = Bitmap.Config.RGB_565
                }
                conn.inputStream.use { stream ->
                    BitmapFactory.decodeStream(stream, null, options)
                }
            } else {
                null
            }
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}
