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

        // Check cache first
        val cached = memoryCache.get(urlString)
        if (cached != null) {
            imageView.setImageBitmap(cached)
            return
        }

        if (placeholderRes != null) {
            imageView.setImageResource(placeholderRes)
        } else {
            imageView.setImageDrawable(null)
        }

        imageView.tag = urlString

        CoroutineScope(Dispatchers.IO).launch {
            val bitmap = downloadBitmap(urlString)
            if (bitmap != null) {
                memoryCache.put(urlString, bitmap)
                withContext(Dispatchers.Main) {
                    if (imageView.tag == urlString) {
                        imageView.setImageBitmap(bitmap)
                    }
                }
            }
        }
    }

    private fun downloadBitmap(urlString: String): Bitmap? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL(urlString)
            conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")

            val options = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.RGB_565
            }
            conn.inputStream.use { stream ->
                BitmapFactory.decodeStream(stream, null, options)
            }
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}
