package io.keepsake.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import io.keepsake.app.databinding.ActivityShareBinding
import io.keepsake.app.models.Collection
import io.keepsake.app.utils.flattenCollections
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.regex.Pattern

class ShareActivity : AppCompatActivity() {

    private lateinit var binding: ActivityShareBinding

    private var targetUrl: String = ""
    private var detectedDomain: String = ""
    private var currentCoverUrl: String? = null
    private var bookmarkType: String = "link"
    private var isFavorite: Boolean = false
    private var platformJob: Job? = null
    private var scrapeJob: Job? = null

    private val collectionList = mutableListOf<CollectionOption>()

    data class CollectionOption(val id: String?, val title: String) {
        override fun toString(): String = title
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityShareBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val intent = intent
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null) {
            setupShareFlow(intent)
        } else {
            finish()
        }
    }

    private fun setupShareFlow(intent: Intent) {
        val session = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
            .getString(MainActivity.KEY_AUTH_SESSION, null)
        if (session.isNullOrEmpty()) {
            Toast.makeText(this, "Please sign in to Keepsake first", Toast.LENGTH_SHORT).show()
            val mainIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            startActivity(mainIntent)
            finish()
            return
        }

        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""

        val extracted = extractUrl(sharedText)
        if (extracted == null) {
            Toast.makeText(this, getString(R.string.invalid_link), Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        targetUrl = extracted
        detectedDomain = extractDomain(targetUrl)

        // Dismiss when tapping outside the sheet
        binding.rootContainer.setOnClickListener { finish() }
        binding.sheetContainer.setOnClickListener { /* prevent dismissal when tapping card */ }

        binding.btnClose.setOnClickListener { finish() }
        binding.btnCancel.setOnClickListener { finish() }

        binding.btnShareNewCollection.setOnClickListener {
            showCreateCollectionDialog()
        }

        binding.btnFavorite.setOnClickListener {
            isFavorite = !isFavorite
            updateFavoriteIcon()
        }

        binding.btnSave.setOnClickListener {
            saveBookmark()
        }

        // Initial preview UI
        binding.tvUrl.text = targetUrl
        binding.tvDomain.text = detectedDomain

        val initialTitle = extractTitle(sharedText, targetUrl, sharedSubject)
        if (initialTitle.isNotEmpty()) {
            binding.etTitle.setText(initialTitle)
        } else {
            binding.etTitle.setText(detectedDomain)
        }

        setupCollectionsSpinner()

        // Background enrich: collections & platform heuristics / server scraper
        fetchCollectionsAsync()
        checkPlatformSpecifics()
    }

    private fun updateFavoriteIcon() {
        if (isFavorite) {
            binding.btnFavorite.setImageResource(R.drawable.ic_star_filled)
        } else {
            binding.btnFavorite.setImageResource(R.drawable.ic_star_empty)
        }
    }

    private fun checkPlatformSpecifics() {
        // 1. YouTube detection
        val ytVideoId = extractYouTubeVideoId(targetUrl)
        if (ytVideoId != null) {
            bookmarkType = "video"
            detectedDomain = "youtube.com"
            binding.tvDomain.text = detectedDomain
            currentCoverUrl = "https://i.ytimg.com/vi/$ytVideoId/hqdefault.jpg"
            loadThumbnailBitmap(currentCoverUrl!!)
            fetchScrapedMetadataAsync(targetUrl)
            return
        }

        // 2. Reddit detection
        if (isRedditUrl(targetUrl)) {
            platformJob = lifecycleScope.launch(Dispatchers.IO) {
                processRedditPost(targetUrl)
                // Call server scraper with the resolved canonical URL
                fetchScrapedMetadataAsync(targetUrl)
            }
            return
        }

        // 3. Generic link: normal server scraper
        fetchScrapedMetadataAsync(targetUrl)
    }

    private fun setupCollectionsSpinner() {
        collectionList.clear()
        collectionList.add(CollectionOption(null, getString(R.string.unsorted)))

        val adapter = ArrayAdapter(
            this,
            R.layout.item_spinner_selected,
            collectionList
        ).apply {
            setDropDownViewResource(R.layout.item_spinner)
        }
        binding.spinnerCollection.adapter = adapter
    }

    private fun fetchCollectionsAsync() {
        val serverUrl = getServerUrl()
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val jsonStr = httpGet("$serverUrl/api/collections", serverUrl) ?: return@launch
                val json = JSONObject(jsonStr)
                val collectionsArray = json.optJSONArray("collections") ?: return@launch

                val fetched = mutableListOf<CollectionOption>()
                fetched.add(CollectionOption(null, getString(R.string.unsorted)))

                val customItems = mutableListOf<Collection>()
                for (i in 0 until collectionsArray.length()) {
                    val item = collectionsArray.getJSONObject(i)
                    val id = item.optString("id")
                    val title = item.optString("title")
                    val isSystem = item.optBoolean("isSystem", false)
                    if (id.isNotEmpty() && title.isNotEmpty() && !isSystem && id != "unsorted" && id != "all" && id != "favorites" && id != "trash") {
                        customItems.add(Collection.fromJson(item))
                    }
                }
                fetched.addAll(flattenCollections(customItems).map { CollectionOption(it.collection.id, it.label) })

                withContext(Dispatchers.Main) {
                    collectionList.clear()
                    collectionList.addAll(fetched)
                    (binding.spinnerCollection.adapter as? ArrayAdapter<*>)?.notifyDataSetChanged()
                }
            } catch (e: Exception) {
                // Ignore collection load error, fallback to Unsorted
            }
        }
    }

    private fun showCreateCollectionDialog() {
        val input = android.widget.EditText(this).apply {
            hint = "e.g. Design, Reading, Recipes"
            setBackgroundResource(R.drawable.bg_input)
            setTextColor(android.graphics.Color.WHITE)
            setHintTextColor(0xFF64748B.toInt())
            setPadding(36, 24, 36, 24)
        }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("New Collection")
            .setView(input)
            .setPositiveButton("Create") { _, _ ->
                val title = input.text.toString().trim()
                if (title.isNotEmpty()) {
                    val serverUrl = getServerUrl()
                    lifecycleScope.launch(Dispatchers.IO) {
                        val payload = JSONObject().apply {
                            put("title", title)
                            put("color", "#38BDF8")
                            put("icon", "Folder")
                            put("isSystem", false)
                        }
                        val (code, resp) = httpPost("$serverUrl/api/collections", payload.toString(), serverUrl)
                        if (code in 200..299 && resp != null) {
                            val resObj = JSONObject(resp)
                            val colObj = resObj.optJSONObject("collection")
                            val newId = colObj?.optString("id") ?: ""
                            val newTitle = colObj?.optString("title") ?: title

                            withContext(Dispatchers.Main) {
                                val newOption = CollectionOption(newId, newTitle)
                                collectionList.add(newOption)
                                (binding.spinnerCollection.adapter as? ArrayAdapter<*>)?.notifyDataSetChanged()
                                binding.spinnerCollection.setSelection(collectionList.size - 1)
                                Toast.makeText(this@ShareActivity, "Collection \"$newTitle\" created!", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            withContext(Dispatchers.Main) {
                                Toast.makeText(this@ShareActivity, "Failed to create collection", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun fetchScrapedMetadataAsync(targetToScrape: String = targetUrl) {
        val serverUrl = getServerUrl()
        val encodedUrl = URLEncoder.encode(targetToScrape, "UTF-8")

        scrapeJob = lifecycleScope.launch(Dispatchers.IO) {
            try {
                val jsonStr = httpGet("$serverUrl/api/scrape?url=$encodedUrl", serverUrl) ?: return@launch
                val meta = JSONObject(jsonStr)

                val scrapedTitle = meta.optString("title")
                val scrapedCover = meta.optString("cover")
                val scrapedDomain = meta.optString("domain")

                withContext(Dispatchers.Main) {
                    if (scrapedDomain.isNotEmpty() && (binding.tvDomain.text == detectedDomain || binding.tvDomain.text.isEmpty())) {
                        detectedDomain = scrapedDomain
                        binding.tvDomain.text = detectedDomain
                    }

                    // Update title if user hasn't modified it or if it was just the domain
                    val currentTitle = binding.etTitle.text.toString().trim()
                    if (scrapedTitle.isNotEmpty() && (currentTitle.isEmpty() || currentTitle == detectedDomain || currentTitle == targetUrl)) {
                        val cleaned = if (isRedditUrl(targetUrl)) cleanRedditTitle(scrapedTitle) else scrapedTitle
                        binding.etTitle.setText(cleaned)
                    }

                    // Update cover if not yet loaded
                    if (scrapedCover.isNotEmpty() && currentCoverUrl == null) {
                        currentCoverUrl = scrapedCover
                        loadThumbnailBitmap(scrapedCover)
                    }
                }
            } catch (e: Exception) {
                // Background scrape failure is non-fatal
            }
        }
    }

    private fun loadThumbnailBitmap(imageUrl: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            val bmp = fetchBitmap(imageUrl)
            if (bmp != null) {
                withContext(Dispatchers.Main) {
                    binding.ivThumbnail.setImageBitmap(bmp)
                }
            }
        }
    }

    private fun saveBookmark() {
        // Disable UI and show saving state
        binding.btnSave.isEnabled = false
        binding.btnCancel.isEnabled = false
        binding.btnSave.text = ""
        binding.pbSaving.visibility = View.VISIBLE

        val serverUrl = getServerUrl()

        lifecycleScope.launch(Dispatchers.IO) {
            // 1. Await in-flight platform specifics (redirect resolution, oEmbed title, RSS thumbnail)
            try {
                withTimeoutOrNull(2500) {
                    platformJob?.join()
                }
            } catch (_: Exception) {}

            // 2. Immediate safety resolution for Reddit: if cover is still missing or shortlink unresolved, resolve now
            if (isRedditUrl(targetUrl) && (currentCoverUrl.isNullOrEmpty() || targetUrl.contains("/s/") || !targetUrl.contains("/comments/"))) {
                processRedditPost(targetUrl)
            }

            val rawTitle = withContext(Dispatchers.Main) {
                binding.etTitle.text.toString().trim()
            }
            val cleanTitle = cleanRedditTitle(rawTitle)
            val titleToSend = if (isSparseTitle(cleanTitle, detectedDomain, targetUrl)) "" else cleanTitle

            val notes = withContext(Dispatchers.Main) {
                binding.etNotes.text.toString().trim()
            }
            val tagsInput = withContext(Dispatchers.Main) {
                binding.etTags.text.toString().trim()
            }
            val selectedCollection = withContext(Dispatchers.Main) {
                binding.spinnerCollection.selectedItem as? CollectionOption
            }
            val collectionId = selectedCollection?.id

            val tagsArray = JSONArray()
            if (tagsInput.isNotEmpty()) {
                tagsInput.split(",").forEach {
                    val cleanTag = it.trim().removePrefix("#")
                    if (cleanTag.isNotEmpty()) {
                        tagsArray.put(cleanTag)
                    }
                }
            }

            val payload = JSONObject().apply {
                put("url", targetUrl)
                put("title", titleToSend)
                put("domain", detectedDomain)
                put("note", notes)
                put("collectionId", collectionId ?: JSONObject.NULL)
                put("tags", tagsArray)
                put("isFavorite", isFavorite)
                put("type", bookmarkType)
                if (!currentCoverUrl.isNullOrEmpty() && !currentCoverUrl!!.contains("redditstatic.com") && !currentCoverUrl!!.contains("icon.png")) {
                    put("cover", currentCoverUrl)
                }
            }

            val (status, _) = httpPost("$serverUrl/api/bookmarks", payload.toString(), serverUrl)

            withContext(Dispatchers.Main) {
                if (status in 200..299) {
                    Toast.makeText(this@ShareActivity, getString(R.string.bookmark_saved), Toast.LENGTH_SHORT).show()

                    // Return cleanly to MainActivity and trigger instant bookmark sync
                    val mainIntent = Intent(this@ShareActivity, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        putExtra("reload_bookmarks", true)
                    }
                    startActivity(mainIntent)
                    finish()
                } else {
                    binding.btnSave.isEnabled = true
                    binding.btnCancel.isEnabled = true
                    binding.btnSave.setText(R.string.save)
                    binding.pbSaving.visibility = View.GONE
                    Toast.makeText(this@ShareActivity, getString(R.string.save_failed), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun isSparseTitle(title: String?, domain: String, url: String): Boolean {
        if (title.isNullOrBlank()) return true
        val clean = title.trim()
        if (clean.equals(url.trim(), ignoreCase = true)) return true
        if (clean.equals(domain.trim(), ignoreCase = true)) return true
        if (clean.equals("reddit.com", ignoreCase = true) ||
            clean.equals("reddit", ignoreCase = true) ||
            clean.startsWith("reddit:", ignoreCase = true) ||
            clean.equals("reddit - dive into anything", ignoreCase = true)
        ) {
            return true
        }
        return false
    }

    private fun getServerUrl(): String {
        val prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(MainActivity.KEY_SERVER_URL, MainActivity.DEFAULT_SERVER_URL)
            ?: MainActivity.DEFAULT_SERVER_URL
    }

    // --- Network Helpers ---

    private fun httpGet(urlString: String, serverUrl: String, customUa: String? = null): String? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL(urlString)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.setRequestProperty("Accept", if (customUa != null) "*/*" else "application/json")
            if (customUa != null) {
                conn.setRequestProperty("User-Agent", customUa)
            }

            val cookie = CookieManager.getInstance().getCookie(serverUrl)
            if (!cookie.isNullOrEmpty()) {
                conn.setRequestProperty("Cookie", cookie)
            }

            conn.connect()
            if (conn.responseCode in 200..299) {
                conn.inputStream.bufferedReader().use(BufferedReader::readText)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun httpPost(urlString: String, jsonPayload: String, serverUrl: String): Pair<Int, String?> {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL(urlString)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            conn.setRequestProperty("Accept", "application/json")

            val cookie = CookieManager.getInstance().getCookie(serverUrl)
            if (!cookie.isNullOrEmpty()) {
                conn.setRequestProperty("Cookie", cookie)
            }

            OutputStreamWriter(conn.outputStream, "UTF-8").use {
                it.write(jsonPayload)
                it.flush()
            }

            val code = conn.responseCode
            val responseText = if (code in 200..299) {
                conn.inputStream?.bufferedReader()?.use(BufferedReader::readText)
            } else {
                conn.errorStream?.bufferedReader()?.use(BufferedReader::readText)
            }
            Pair(code, responseText)
        } catch (e: Exception) {
            Pair(-1, e.message)
        } finally {
            conn?.disconnect()
        }
    }

    private fun cleanRedditMediaUrl(rawUrl: String?): String? {
        if (rawUrl.isNullOrBlank()) return null
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
                val matcher = Pattern.compile("[?&]url=([^&]+)").matcher(url)
                if (matcher.find()) {
                    url = URLDecoder.decode(matcher.group(1), "UTF-8")
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

        if (url.contains("redditstatic.com") || url.contains("icon.png") || url.contains("share.redd.it") || url.contains("default_to_")) {
            return null
        }

        return url
    }

    private fun fetchBitmap(urlString: String): Bitmap? {
        val sanitized = cleanRedditMediaUrl(urlString) ?: urlString
        var conn: HttpURLConnection? = null
        return try {
            val url = URL(sanitized)
            conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            conn.setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
            conn.connect()
            if (conn.responseCode in 200..299) {
                conn.inputStream.use { input ->
                    BitmapFactory.decodeStream(input)
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

    private suspend fun processRedditPost(url: String) {
        if (url.contains("/s/") || url.contains("redd.it") || !url.contains("/comments/")) {
            resolveRedditPostDetails(url)
        } else {
            val subreddit = extractRedditSubreddit(url)
            withContext(Dispatchers.Main) {
                if (subreddit != null) {
                    binding.tvDomain.text = "r/${subreddit.lowercase()}"
                    if (binding.etTags.text.isEmpty()) {
                        binding.etTags.setText(subreddit.lowercase())
                    }
                } else {
                    binding.tvDomain.text = "reddit.com"
                }

                val currentTitle = binding.etTitle.text.toString()
                val cleaned = cleanRedditTitle(currentTitle)
                if (cleaned.isNotEmpty()) {
                    binding.etTitle.setText(cleaned)
                }
            }
            fetchRedditRssAndOEmbed(url)
        }
    }

    private suspend fun resolveRedditPostDetails(urlToResolve: String) {
        val botUa = "facebookexternalhit/1.3 (+http://www.facebook.com/externalhit_uatext.php)"
        var current = urlToResolve
        var hops = 0
        val maxHops = 6

        while (hops < maxHops) {
            var conn: HttpURLConnection? = null
            try {
                val url = URL(current)
                conn = url.openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = false
                conn.requestMethod = "GET"
                conn.setRequestProperty("User-Agent", botUa)
                conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                conn.connectTimeout = 6000
                conn.readTimeout = 6000
                conn.connect()

                val code = conn.responseCode
                if (code in listOf(HttpURLConnection.HTTP_MOVED_PERM, HttpURLConnection.HTTP_MOVED_TEMP, HttpURLConnection.HTTP_SEE_OTHER, 307, 308)) {
                    val location = conn.getHeaderField("Location")
                    if (!location.isNullOrEmpty()) {
                        val nextUrl = URL(url, location).toString()
                        if (nextUrl != current) {
                            current = nextUrl
                            hops++
                            continue
                        }
                    }
                }

                if (code in 200..299) {
                    val html = conn.inputStream.bufferedReader().use { it.readText() }

                    // 1. Check for canonical og:url
                    val ogUrlPattern = Pattern.compile("<meta property=[\"']og:url[\"'] content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE)
                    val ogUrlMatcher = ogUrlPattern.matcher(html)
                    if (ogUrlMatcher.find()) {
                        val ogUrl = ogUrlMatcher.group(1)
                        if (!ogUrl.isNullOrEmpty() && ogUrl.contains("reddit.com")) {
                            targetUrl = ogUrl
                        }
                    } else if (current != targetUrl) {
                        targetUrl = current
                    }

                    // 2. Check for og:image / twitter:image
                    val ogImgPattern = Pattern.compile("<meta property=[\"']og:image[\"'] content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE)
                    val twImgPattern = Pattern.compile("<meta (?:name|property)=[\"']twitter:image(?::src)?[\"'] content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE)
                    val ogImgMatcher = ogImgPattern.matcher(html)
                    val twImgMatcher = twImgPattern.matcher(html)
                    val rawImg = if (ogImgMatcher.find()) ogImgMatcher.group(1) else if (twImgMatcher.find()) twImgMatcher.group(1) else null
                    val cleanImg = cleanRedditMediaUrl(rawImg)

                    if (!cleanImg.isNullOrEmpty()) {
                        currentCoverUrl = cleanImg
                        bookmarkType = "image"
                        loadThumbnailBitmap(cleanImg)
                    }

                    // 3. Check for og:title
                    val ogTitlePattern = Pattern.compile("<meta property=[\"']og:title[\"'] content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE)
                    val ogTitleMatcher = ogTitlePattern.matcher(html)
                    if (ogTitleMatcher.find()) {
                        val rawTitle = ogTitleMatcher.group(1) ?: ""
                        val cleanTitle = cleanRedditTitle(rawTitle)
                        if (cleanTitle.isNotEmpty()) {
                            withContext(Dispatchers.Main) {
                                val cur = binding.etTitle.text.toString().trim()
                                if (cur.isEmpty() || cur == detectedDomain || cur == targetUrl) {
                                    binding.etTitle.setText(cleanTitle)
                                }
                            }
                        }
                    }
                }
                break
            } catch (e: Exception) {
                break
            } finally {
                conn?.disconnect()
            }
        }

        // Update UI with resolved URL and domain
        withContext(Dispatchers.Main) {
            binding.tvUrl.text = targetUrl
            detectedDomain = extractDomain(targetUrl)
            val sub = extractRedditSubreddit(targetUrl)
            if (sub != null) {
                binding.tvDomain.text = "r/${sub.lowercase()}"
                if (binding.etTags.text.isEmpty()) {
                    binding.etTags.setText(sub.lowercase())
                }
            } else {
                binding.tvDomain.text = detectedDomain
            }
        }

        // Also fetch RSS & oEmbed for complete details
        fetchRedditRssAndOEmbed(targetUrl)
    }

    private suspend fun fetchRedditRssAndOEmbed(url: String) {
        val postId = extractRedditPostId(url)
        val subreddit = extractRedditSubreddit(url)
        val botUa = "facebookexternalhit/1.3 (+http://www.facebook.com/externalhit_uatext.php)"

        // 1. RSS Feed for media & title
        if (postId != null) {
            try {
                val rssUrl = if (subreddit != null) {
                    "https://www.reddit.com/r/$subreddit/comments/$postId/.rss"
                } else {
                    "https://www.reddit.com/comments/$postId/.rss"
                }

                val xml = httpGet(rssUrl, "https://www.reddit.com", customUa = botUa)
                if (!xml.isNullOrEmpty()) {
                    val directPattern = Pattern.compile("https://i\\.redd\\.it/[a-zA-Z0-9_\\-\\.]+\\.(?:jpe?g|png|webp|gif)", Pattern.CASE_INSENSITIVE)
                    val directMatcher = directPattern.matcher(xml)
                    val mediaPattern = Pattern.compile("<media:(?:thumbnail|content)[^>]+url=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE)
                    val mediaMatcher = mediaPattern.matcher(xml)
                    val previewPattern = Pattern.compile("https://(?:preview|external-preview|a\\.thumbs|b\\.thumbs)\\.redd(?:it|\\.it)/[^\"&<>\\s]+(?:\\?[^\"<>\\s]*)?", Pattern.CASE_INSENSITIVE)
                    val previewMatcher = previewPattern.matcher(xml)

                    var thumb: String? = null
                    if (directMatcher.find()) {
                        thumb = directMatcher.group()
                    } else if (mediaMatcher.find()) {
                        thumb = mediaMatcher.group(1)
                    } else if (previewMatcher.find()) {
                        thumb = previewMatcher.group()
                    }

                    val cleaned = cleanRedditMediaUrl(thumb)
                    if (!cleaned.isNullOrEmpty()) {
                        currentCoverUrl = cleaned
                        bookmarkType = "image"
                        loadThumbnailBitmap(cleaned)
                    }

                    // Check title in RSS
                    val titlePattern = Pattern.compile("<entry>[^]*?<title>([^<]+)</title>", Pattern.CASE_INSENSITIVE)
                    val titleMatcher = titlePattern.matcher(xml)
                    if (titleMatcher.find()) {
                        val rawT = titleMatcher.group(1) ?: ""
                        var t = rawT
                        while (t.contains("&amp;")) t = t.replace("&amp;", "&")
                        t = cleanRedditTitle(t)
                        if (t.isNotEmpty()) {
                            withContext(Dispatchers.Main) {
                                val cur = binding.etTitle.text.toString().trim()
                                if (cur.isEmpty() || cur == detectedDomain || cur == targetUrl) {
                                    binding.etTitle.setText(t)
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {}
        }

        // 2. oEmbed if title is still sparse
        try {
            val cur = withContext(Dispatchers.Main) { binding.etTitle.text.toString().trim() }
            if (isSparseTitle(cur, detectedDomain, url)) {
                val encodedTarget = URLEncoder.encode(url, "UTF-8")
                val oembedUrl = "https://www.reddit.com/oembed?url=$encodedTarget"
                val jsonStr = httpGet(oembedUrl, "https://www.reddit.com", customUa = botUa)
                if (!jsonStr.isNullOrEmpty()) {
                    val json = JSONObject(jsonStr)
                    val oTitle = json.optString("title")
                    if (oTitle.isNotEmpty()) {
                        withContext(Dispatchers.Main) {
                            binding.etTitle.setText(cleanRedditTitle(oTitle))
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        // 3. OpenGraph fallback if cover is still missing
        if (currentCoverUrl == null) {
            try {
                val html = httpGet(url, "https://www.reddit.com", customUa = botUa)
                if (!html.isNullOrEmpty()) {
                    val ogImgPattern = Pattern.compile("<meta property=[\"']og:image[\"'] content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE)
                    val twImgPattern = Pattern.compile("<meta (?:name|property)=[\"']twitter:image(?::src)?[\"'] content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE)
                    val ogImgMatcher = ogImgPattern.matcher(html)
                    val twImgMatcher = twImgPattern.matcher(html)
                    val rawImg = if (ogImgMatcher.find()) ogImgMatcher.group(1) else if (twImgMatcher.find()) twImgMatcher.group(1) else null
                    val cleanImg = cleanRedditMediaUrl(rawImg)
                    if (!cleanImg.isNullOrEmpty()) {
                        currentCoverUrl = cleanImg
                        bookmarkType = "image"
                        loadThumbnailBitmap(cleanImg)
                    }
                }
            } catch (_: Exception) {}
        }
    }

    // --- Extraction & Parsing Helpers ---

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

    private fun extractTitle(sharedText: String, url: String, sharedSubject: String?): String {
        if (!sharedSubject.isNullOrBlank() && sharedSubject != url) {
            return cleanRedditTitle(sharedSubject.trim())
        }
        val remainder = sharedText.replace(url, "").trim()
        val cleaned = remainder.removePrefix("-").removePrefix(":").trim()
        return if (cleaned.isNotEmpty()) cleanRedditTitle(cleaned) else ""
    }

    private fun extractDomain(urlString: String): String {
        return try {
            val uri = Uri.parse(urlString)
            val host = uri.host ?: urlString
            host.removePrefix("www.")
        } catch (e: Exception) {
            urlString
        }
    }

    private fun extractYouTubeVideoId(url: String): String? {
        val pattern = "(?:youtu\\.be/|youtube\\.com/(?:embed/|v/|watch\\?v=|watch\\?.+&v=|shorts/))([a-zA-Z0-9_-]{11})"
        val matcher = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(url)
        return if (matcher.find()) matcher.group(1) else null
    }

    private fun isRedditUrl(url: String): Boolean {
        return url.contains("reddit.com", ignoreCase = true) || url.contains("redd.it", ignoreCase = true)
    }

    private fun extractRedditSubreddit(url: String): String? {
        val pattern = "reddit\\.com/r/([a-zA-Z0-9_]+)"
        val matcher = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(url)
        return if (matcher.find()) matcher.group(1) else null
    }

    private fun extractRedditPostId(url: String): String? {
        val pattern = "(?:comments|gallery)/([a-zA-Z0-9]+)"
        val matcher = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(url)
        if (matcher.find()) return matcher.group(1)

        val reddItPattern = "redd\\.it/([a-zA-Z0-9]+)"
        val reddItMatcher = Pattern.compile(reddItPattern, Pattern.CASE_INSENSITIVE).matcher(url)
        if (reddItMatcher.find()) return reddItMatcher.group(1)

        return null
    }

    private fun cleanRedditTitle(title: String): String {
        var clean = title.trim()
        val patterns = listOf(
            Regex("^From the [^:]+ community on Reddit:\\s*", RegexOption.IGNORE_CASE),
            Regex("^From the [^:]+ on Reddit:\\s*", RegexOption.IGNORE_CASE),
            Regex("\\s*:\\s*r/[a-zA-Z0-9_]+.*$", RegexOption.IGNORE_CASE),
            Regex("\\s*[-–—]\\s*r/[a-zA-Z0-9_]+.*$", RegexOption.IGNORE_CASE),
            Regex("\\s*[-–—]\\s*Reddit.*$", RegexOption.IGNORE_CASE),
            Regex("\\s*:\\s*Reddit.*$", RegexOption.IGNORE_CASE)
        )
        for (p in patterns) {
            clean = clean.replace(p, "").trim()
        }
        return clean
    }
}
