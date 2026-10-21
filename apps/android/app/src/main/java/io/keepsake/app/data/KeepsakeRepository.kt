package io.keepsake.app.data

import android.content.Context
import io.keepsake.app.models.Bookmark
import io.keepsake.app.models.Collection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*

class KeepsakeRepository(private val context: Context) {

    private val cacheFileName = "keepsake_store_cache.json"

    var bookmarks: MutableList<Bookmark> = mutableListOf()
        private set

    var collections: MutableList<Collection> = mutableListOf()
        private set

    init {
        loadFromCache()
    }

    private fun loadFromCache() {
        try {
            val file = File(context.filesDir, cacheFileName)
            if (file.exists()) {
                val jsonStr = file.readText()
                val root = JSONObject(jsonStr)

                val bmsArr = root.optJSONArray("bookmarks") ?: JSONArray()
                val colsArr = root.optJSONArray("collections") ?: JSONArray()

                val bms = mutableListOf<Bookmark>()
                for (i in 0 until bmsArr.length()) {
                    val obj = bmsArr.optJSONObject(i)
                    if (obj != null) bms.add(Bookmark.fromJson(obj))
                }

                val cols = mutableListOf<Collection>()
                for (i in 0 until colsArr.length()) {
                    val obj = colsArr.optJSONObject(i)
                    if (obj != null) cols.add(Collection.fromJson(obj))
                }

                bookmarks = bms
                collections = cols
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun saveToCache() {
        try {
            val root = JSONObject()
            val bmsArr = JSONArray()
            bookmarks.forEach { bmsArr.put(it.toJson()) }

            val colsArr = JSONArray()
            collections.forEach { colsArr.put(it.toJson()) }

            root.put("bookmarks", bmsArr)
            root.put("collections", colsArr)
            root.put("lastModified", nowIso())

            val file = File(context.filesDir, cacheFileName)
            file.writeText(root.toString())
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun syncWithServer(serverUrl: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = URL("${serverUrl.removeSuffix("/")}/api/sync")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8000
                readTimeout = 8000
                setRequestProperty("Accept", "application/json")
            }

            if (conn.responseCode in 200..299) {
                val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                val root = JSONObject(responseText)
                val store = root.optJSONObject("store") ?: root

                val bmsArr = store.optJSONArray("bookmarks") ?: JSONArray()
                val colsArr = store.optJSONArray("collections") ?: JSONArray()

                val remoteBms = mutableListOf<Bookmark>()
                for (i in 0 until bmsArr.length()) {
                    val obj = bmsArr.optJSONObject(i)
                    if (obj != null) remoteBms.add(Bookmark.fromJson(obj))
                }

                val remoteCols = mutableListOf<Collection>()
                for (i in 0 until colsArr.length()) {
                    val obj = colsArr.optJSONObject(i)
                    if (obj != null) remoteCols.add(Collection.fromJson(obj))
                }

                bookmarks = remoteBms
                collections = remoteCols
                saveToCache()
                true
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    suspend fun toggleFavorite(bookmarkId: String, serverUrl: String) = withContext(Dispatchers.IO) {
        val index = bookmarks.indexOfFirst { it.id == bookmarkId }
        if (index != -1) {
            val current = bookmarks[index]
            val updated = current.copy(isFavorite = !current.isFavorite, updatedAt = nowIso())
            bookmarks[index] = updated
            saveToCache()

            // Persist to server
            httpPut("${serverUrl.removeSuffix("/")}/api/bookmarks/$bookmarkId", JSONObject().apply {
                put("isFavorite", updated.isFavorite)
            }.toString())
        }
    }

    suspend fun moveToTrash(bookmarkId: String, serverUrl: String) = withContext(Dispatchers.IO) {
        val index = bookmarks.indexOfFirst { it.id == bookmarkId }
        if (index != -1) {
            val current = bookmarks[index]
            val updated = current.copy(isTrash = true, updatedAt = nowIso())
            bookmarks[index] = updated
            saveToCache()

            httpPut("${serverUrl.removeSuffix("/")}/api/bookmarks/$bookmarkId", JSONObject().apply {
                put("isTrash", true)
            }.toString())
        }
    }

    suspend fun restoreFromTrash(bookmarkId: String, serverUrl: String) = withContext(Dispatchers.IO) {
        val index = bookmarks.indexOfFirst { it.id == bookmarkId }
        if (index != -1) {
            val current = bookmarks[index]
            val updated = current.copy(isTrash = false, updatedAt = nowIso())
            bookmarks[index] = updated
            saveToCache()

            httpPut("${serverUrl.removeSuffix("/")}/api/bookmarks/$bookmarkId", JSONObject().apply {
                put("isTrash", false)
            }.toString())
        }
    }

    suspend fun deletePermanently(bookmarkId: String, serverUrl: String) = withContext(Dispatchers.IO) {
        bookmarks.removeAll { it.id == bookmarkId }
        saveToCache()

        try {
            val url = URL("${serverUrl.removeSuffix("/")}/api/bookmarks/$bookmarkId")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "DELETE"
                connectTimeout = 6000
                readTimeout = 6000
            }
            conn.responseCode
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun moveBookmark(bookmarkId: String, collectionId: String?, serverUrl: String) = withContext(Dispatchers.IO) {
        val index = bookmarks.indexOfFirst { it.id == bookmarkId }
        if (index != -1) {
            val current = bookmarks[index]
            val updated = current.copy(collectionId = collectionId, isTrash = false, updatedAt = nowIso())
            bookmarks[index] = updated
            saveToCache()

            httpPut("${serverUrl.removeSuffix("/")}/api/bookmarks/$bookmarkId", JSONObject().apply {
                put("collectionId", collectionId ?: JSONObject.NULL)
                put("isTrash", false)
            }.toString())
        }
    }

    suspend fun addTag(bookmarkId: String, tag: String, serverUrl: String) = withContext(Dispatchers.IO) {
        val cleanTag = tag.trim().lowercase().removePrefix("#")
        if (cleanTag.isEmpty()) return@withContext

        val index = bookmarks.indexOfFirst { it.id == bookmarkId }
        if (index != -1) {
            val current = bookmarks[index]
            if (!current.tags.contains(cleanTag)) {
                val nextTags = current.tags + cleanTag
                val updated = current.copy(tags = nextTags, updatedAt = nowIso())
                bookmarks[index] = updated
                saveToCache()

                val tagsArr = JSONArray()
                nextTags.forEach { tagsArr.put(it) }
                httpPut("${serverUrl.removeSuffix("/")}/api/bookmarks/$bookmarkId", JSONObject().apply {
                    put("tags", tagsArr)
                }.toString())
            }
        }
    }

    suspend fun createBookmark(
        url: String,
        title: String,
        notes: String?,
        collectionId: String?,
        tags: List<String>,
        isFavorite: Boolean,
        cover: String?,
        domain: String,
        serverUrl: String
    ): Boolean = withContext(Dispatchers.IO) {
        val tagsArr = JSONArray()
        tags.forEach { tagsArr.put(it) }

        val payload = JSONObject().apply {
            put("url", url)
            put("title", title)
            put("domain", domain)
            put("note", notes ?: "")
            put("collectionId", collectionId ?: JSONObject.NULL)
            put("tags", tagsArr)
            put("isFavorite", isFavorite)
            put("type", "link")
            if (!cover.isNullOrEmpty()) {
                put("cover", cover)
            }
        }

        val res = httpPost("${serverUrl.removeSuffix("/")}/api/bookmarks", payload.toString())
        if (res != null) {
            val created = Bookmark.fromJson(res)
            bookmarks.add(0, created)
            saveToCache()
            true
        } else {
            false
        }
    }

    private fun httpPut(urlString: String, jsonBody: String) {
        try {
            val url = URL(urlString)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "PUT"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            conn.outputStream.bufferedWriter().use { it.write(jsonBody) }
            conn.responseCode
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun httpPost(urlString: String, jsonBody: String): JSONObject? {
        return try {
            val url = URL(urlString)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8000
                readTimeout = 8000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            conn.outputStream.bufferedWriter().use { it.write(jsonBody) }
            if (conn.responseCode in 200..299) {
                val resp = conn.inputStream.bufferedReader().use { it.readText() }
                JSONObject(resp)
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun nowIso(): String {
        val tz = TimeZone.getTimeZone("UTC")
        val df = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = tz
        }
        return df.format(Date())
    }
}
