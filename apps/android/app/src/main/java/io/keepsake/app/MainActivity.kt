package io.keepsake.app

import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.PopupMenu
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import io.keepsake.app.adapters.BookmarkAdapter
import io.keepsake.app.data.KeepsakeRepository
import io.keepsake.app.databinding.ActivityMainBinding
import io.keepsake.app.models.AuthSession
import io.keepsake.app.models.Bookmark
import io.keepsake.app.models.Collection
import io.keepsake.app.utils.ImageLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var repository: KeepsakeRepository
    private lateinit var adapter: BookmarkAdapter

    private var activeFilterId: String = "all"
    private var activeTagFilter: String? = null
    private var searchQuery: String = ""
    private var isGridMode: Boolean = true

    companion object {
        const val PREFS_NAME = "keepsake_prefs"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_AUTH_SESSION = "auth_session"
        const val KEY_VIEW_MODE = "is_grid_view"
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:3000"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = KeepsakeRepository(this)
        isGridMode = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_VIEW_MODE, true)

        setupLoginUI()
        setupNativeUI()
        checkAuthAndRoute(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        checkAuthAndRoute(intent)
    }

    override fun onResume() {
        super.onResume()
        if (binding.loginContainer.visibility == View.VISIBLE) {
            binding.pbGoogleSignIn.visibility = View.GONE
            binding.googleButtonContent.visibility = View.VISIBLE
            binding.btnGoogleSignIn.isEnabled = true
        } else {
            // Check if any bookmark in the view is sparse or missing Reddit media, and refresh if needed
            if (repository.bookmarks.any { bm ->
                !bm.isTrash && (bm.title.isEmpty() || bm.title.equals(bm.domain, ignoreCase = true) || bm.title.equals("reddit.com", ignoreCase = true) || (bm.domain.contains("reddit.com") && bm.cover.isNullOrEmpty()))
            }) {
                lifecycleScope.launch {
                    repository.syncWithServer(getServerUrl())
                    applyFilterAndRender()
                }
            }
        }
    }

    private fun checkAuthAndRoute(intent: Intent?) {
        // 1. Handle deep link from Google OAuth (keepsake://auth?session=...)
        val data = intent?.data
        if (data != null && data.scheme == "keepsake") {
            val sessionJson = data.getQueryParameter("session")
            if (!sessionJson.isNullOrEmpty()) {
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_AUTH_SESSION, sessionJson)
                    .apply()

                Toast.makeText(this, "Signed in successfully!", Toast.LENGTH_SHORT).show()
                showNativeApp()
                syncBookmarks()
                return
            }
        }

        // 2. Check stored session
        val storedSession = getStoredSession()
        if (storedSession.isNullOrEmpty()) {
            showLoginView()
        } else {
            showNativeApp()

            val reloadBookmarks = intent?.getBooleanExtra("reload_bookmarks", false) ?: false
            if (reloadBookmarks) {
                syncBookmarks()
                // Auto-enrichment on the server happens asynchronously in the background.
                // Trigger follow-up background syncs so that enriched title, media, and tags
                // appear seamlessly without requiring manual user pull-to-refresh!
                lifecycleScope.launch {
                    kotlinx.coroutines.delay(2500)
                    repository.syncWithServer(getServerUrl())
                    applyFilterAndRender()
                }
                lifecycleScope.launch {
                    kotlinx.coroutines.delay(5000)
                    repository.syncWithServer(getServerUrl())
                    applyFilterAndRender()
                }
            } else if (repository.bookmarks.isEmpty()) {
                syncBookmarks()
            } else {
                applyFilterAndRender()
            }
        }
    }

    // ==========================================
    // Native Dashboard UI Setup
    // ==========================================
    private fun setupNativeUI() {
        adapter = BookmarkAdapter(
            onItemClick = { bm -> openBookmark(bm) },
            onFavoriteClick = { bm ->
                lifecycleScope.launch {
                    repository.toggleFavorite(bm.id, getServerUrl())
                    applyFilterAndRender()
                }
            },
            onMoreClick = { bm, view -> showBookmarkContextMenu(bm, view) }
        )
        adapter.isGridView = isGridMode
        updateLayoutManager()
        binding.rvBookmarks.adapter = adapter

        // View mode toggle (Grid / List)
        binding.btnToggleView.setOnClickListener {
            isGridMode = !isGridMode
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_VIEW_MODE, isGridMode)
                .apply()
            adapter.isGridView = isGridMode
            updateLayoutManager()
            binding.btnToggleView.setImageResource(
                if (isGridMode) R.drawable.ic_view_list else R.drawable.ic_view_grid
            )
        }
        binding.btnToggleView.setImageResource(
            if (isGridMode) R.drawable.ic_view_list else R.drawable.ic_view_grid
        )

        // Search
        binding.btnSearch.setOnClickListener {
            if (binding.searchContainer.visibility == View.VISIBLE) {
                binding.searchContainer.visibility = View.GONE
                binding.etSearchQuery.setText("")
                searchQuery = ""
                applyFilterAndRender()
            } else {
                binding.searchContainer.visibility = View.VISIBLE
                binding.etSearchQuery.requestFocus()
            }
        }

        binding.btnClearSearch.setOnClickListener {
            binding.etSearchQuery.setText("")
            searchQuery = ""
            applyFilterAndRender()
        }

        binding.etSearchQuery.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                searchQuery = s?.toString()?.trim() ?: ""
                applyFilterAndRender()
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        // Pull to refresh
        binding.swipeRefreshLayout.setColorSchemeColors(0xFF38BDF8.toInt())
        binding.swipeRefreshLayout.setProgressBackgroundColorSchemeColor(0xFF18181B.toInt())
        binding.swipeRefreshLayout.setOnRefreshListener {
            syncBookmarks()
        }

        // FAB: Add Bookmark
        binding.fabAdd.setOnClickListener {
            showAddBookmarkBottomSheet()
        }

        // Bottom Navigation Bar
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_bookmarks -> {
                    activeFilterId = "all"
                    activeTagFilter = null
                    applyFilterAndRender()
                    binding.rvBookmarks.smoothScrollToPosition(0)
                    true
                }
                R.id.nav_collections -> {
                    showCollectionsBottomSheet()
                    true
                }
                R.id.nav_tags -> {
                    showTagsBottomSheet()
                    true
                }
                R.id.nav_settings -> {
                    showSettingsBottomSheet()
                    true
                }
                else -> false
            }
        }
    }

    private fun updateLayoutManager() {
        if (isGridMode) {
            binding.rvBookmarks.layoutManager = GridLayoutManager(this, 2)
        } else {
            binding.rvBookmarks.layoutManager = LinearLayoutManager(this)
        }
    }

    private fun syncBookmarks() {
        binding.swipeRefreshLayout.isRefreshing = true
        lifecycleScope.launch {
            repository.syncWithServer(getServerUrl())
            binding.swipeRefreshLayout.isRefreshing = false
            applyFilterAndRender()
        }
    }

    private fun applyFilterAndRender() {
        val query = searchQuery.lowercase()

        val filtered = repository.bookmarks.filter { bm ->
            // Collection Filter
            val matchesCollection = when (activeFilterId) {
                "all" -> !bm.isTrash
                "unsorted" -> !bm.isTrash && (bm.collectionId == null || bm.collectionId == "unsorted")
                "favorites" -> !bm.isTrash && bm.isFavorite
                "trash" -> bm.isTrash
                else -> !bm.isTrash && bm.collectionId == activeFilterId
            }

            // Tag Filter
            val matchesTag = activeTagFilter == null || bm.tags.any { it.equals(activeTagFilter, ignoreCase = true) }

            // Search Filter
            val matchesSearch = query.isEmpty() ||
                    bm.title.lowercase().contains(query) ||
                    bm.url.lowercase().contains(query) ||
                    bm.domain.lowercase().contains(query) ||
                    bm.tags.any { it.lowercase().contains(query) }

            matchesCollection && matchesTag && matchesSearch
        }

        // Update Title
        val title = when {
            activeTagFilter != null -> "#$activeTagFilter"
            activeFilterId == "all" -> "All Bookmarks"
            activeFilterId == "unsorted" -> "Unsorted Inbox"
            activeFilterId == "favorites" -> "Favorites"
            activeFilterId == "trash" -> "Trash"
            else -> repository.collections.find { it.id == activeFilterId }?.title ?: "Bookmarks"
        }
        binding.tvActiveTitle.text = "$title (${filtered.size})"

        // Render Filter Chips
        renderFilterChips()

        // Submit list
        adapter.submitList(filtered) {
            binding.llEmptyState.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
        }
    }

    private fun renderFilterChips() {
        binding.llFilterChips.removeAllViews()

        val filters = mutableListOf(
            Pair("all", "All"),
            Pair("unsorted", "Unsorted"),
            Pair("favorites", "Favorites"),
            Pair("trash", "Trash")
        )

        filters.forEach { (id, label) ->
            val count = repository.bookmarks.count { bm ->
                when (id) {
                    "all" -> !bm.isTrash
                    "unsorted" -> !bm.isTrash && (bm.collectionId == null || bm.collectionId == "unsorted")
                    "favorites" -> !bm.isTrash && bm.isFavorite
                    "trash" -> bm.isTrash
                    else -> false
                }
            }

            val chipView = LayoutInflater.from(this).inflate(R.layout.item_collection_chip, binding.llFilterChips, false) as TextView
            chipView.text = "$label ($count)"
            val isSelected = activeFilterId == id && activeTagFilter == null

            if (isSelected) {
                chipView.setBackgroundResource(R.drawable.bg_button_primary)
                chipView.setTextColor(Color.WHITE)
            } else {
                chipView.setBackgroundResource(R.drawable.bg_badge)
                chipView.setTextColor(0xFF94A3B8.toInt())
            }

            chipView.setOnClickListener {
                activeFilterId = id
                activeTagFilter = null
                applyFilterAndRender()
            }

            binding.llFilterChips.addView(chipView)
        }

        // If an active custom collection is selected
        if (activeFilterId != "all" && activeFilterId != "unsorted" && activeFilterId != "favorites" && activeFilterId != "trash") {
            val col = repository.collections.find { it.id == activeFilterId }
            if (col != null) {
                val chipView = LayoutInflater.from(this).inflate(R.layout.item_collection_chip, binding.llFilterChips, false) as TextView
                chipView.text = "${col.title} ✕"
                chipView.setBackgroundResource(R.drawable.bg_button_primary)
                chipView.setTextColor(Color.WHITE)
                chipView.setOnClickListener {
                    activeFilterId = "all"
                    applyFilterAndRender()
                }
                binding.llFilterChips.addView(chipView, 0)
            }
        }

        // If an active tag is selected
        if (activeTagFilter != null) {
            val chipView = LayoutInflater.from(this).inflate(R.layout.item_collection_chip, binding.llFilterChips, false) as TextView
            chipView.text = "#$activeTagFilter ✕"
            chipView.setBackgroundResource(R.drawable.bg_button_primary)
            chipView.setTextColor(Color.WHITE)
            chipView.setOnClickListener {
                activeTagFilter = null
                applyFilterAndRender()
            }
            binding.llFilterChips.addView(chipView, 0)
        }
    }

    private fun openBookmark(bm: Bookmark) {
        if (!bm.readerContent.isNullOrEmpty()) {
            showReaderDialog(bm)
        } else {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(bm.url))
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(this, "Unable to open link", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showBookmarkContextMenu(bm: Bookmark, anchor: View) {
        val popup = PopupMenu(this, anchor)
        popup.menu.add("Open in Browser")
        if (!bm.readerContent.isNullOrEmpty()) {
            popup.menu.add("Reader Mode")
        }
        popup.menu.add("Copy Link")
        popup.menu.add("Share Link")
        if (bm.isTrash) {
            popup.menu.add("Restore Bookmark")
            popup.menu.add("Delete Permanently")
        } else {
            popup.menu.add("Move to Collection")
            popup.menu.add("Add Tag")
            popup.menu.add("Move to Trash")
        }

        popup.setOnMenuItemClickListener { item ->
            when (item.title) {
                "Open in Browser" -> {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(bm.url))
                    startActivity(intent)
                    true
                }
                "Reader Mode" -> {
                    showReaderDialog(bm)
                    true
                }
                "Copy Link" -> {
                    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(android.content.ClipData.newPlainText("URL", bm.url))
                    Toast.makeText(this, "Link copied to clipboard", Toast.LENGTH_SHORT).show()
                    true
                }
                "Share Link" -> {
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, bm.url)
                        putExtra(Intent.EXTRA_SUBJECT, bm.title)
                    }
                    startActivity(Intent.createChooser(shareIntent, "Share Bookmark"))
                    true
                }
                "Move to Trash" -> {
                    lifecycleScope.launch {
                        repository.moveToTrash(bm.id, getServerUrl())
                        applyFilterAndRender()
                        Toast.makeText(this@MainActivity, "Moved to Trash", Toast.LENGTH_SHORT).show()
                    }
                    true
                }
                "Restore Bookmark" -> {
                    lifecycleScope.launch {
                        repository.restoreFromTrash(bm.id, getServerUrl())
                        applyFilterAndRender()
                        Toast.makeText(this@MainActivity, "Restored Bookmark", Toast.LENGTH_SHORT).show()
                    }
                    true
                }
                "Delete Permanently" -> {
                    lifecycleScope.launch {
                        repository.deletePermanently(bm.id, getServerUrl())
                        applyFilterAndRender()
                        Toast.makeText(this@MainActivity, "Deleted permanently", Toast.LENGTH_SHORT).show()
                    }
                    true
                }
                "Move to Collection" -> {
                    showMoveToCollectionDialog(bm)
                    true
                }
                "Add Tag" -> {
                    showAddTagDialog(bm)
                    true
                }
                else -> false
            }
        }
        popup.show()
    }

    private fun showMoveToCollectionDialog(bm: Bookmark) {
        val options = mutableListOf(Pair("unsorted", "Unsorted Inbox"))
        repository.collections.filter { !it.isSystem }.forEach {
            options.add(Pair(it.id, it.title))
        }

        val titles = options.map { it.second }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Move to Collection")
            .setItems(titles) { _, which ->
                val targetId = options[which].first
                lifecycleScope.launch {
                    repository.moveBookmark(bm.id, if (targetId == "unsorted") null else targetId, getServerUrl())
                    applyFilterAndRender()
                    Toast.makeText(this@MainActivity, "Moved to ${options[which].second}", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showAddTagDialog(bm: Bookmark) {
        val input = EditText(this).apply {
            hint = "e.g. readlater, dev, ai"
            setBackgroundResource(R.drawable.bg_input)
            setTextColor(Color.WHITE)
            setHintTextColor(0xFF64748B.toInt())
            setPadding(36, 24, 36, 24)
        }

        AlertDialog.Builder(this)
            .setTitle("Add Tag")
            .setView(input)
            .setPositiveButton("Add") { _, _ ->
                val tag = input.text.toString().trim()
                if (tag.isNotEmpty()) {
                    lifecycleScope.launch {
                        repository.addTag(bm.id, tag, getServerUrl())
                        applyFilterAndRender()
                        Toast.makeText(this@MainActivity, "Tag added", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ==========================================
    // Native Bottom Sheets
    // ==========================================
    private fun showCollectionsBottomSheet() {
        val dialog = BottomSheetDialog(this)
        val sheetView = layoutInflater.inflate(R.layout.sheet_collections, null)
        val container = sheetView.findViewById<LinearLayout>(R.id.llCollectionsList)

        val items = mutableListOf<Pair<String, String>>()
        items.add(Pair("all", "All Bookmarks"))
        items.add(Pair("unsorted", "Unsorted Inbox"))
        items.add(Pair("favorites", "Favorites"))
        items.add(Pair("trash", "Trash"))
        repository.collections.filter { !it.isSystem }.forEach {
            items.add(Pair(it.id, it.title))
        }

        items.forEach { (id, title) ->
            val row = TextView(this).apply {
                text = title
                setTextColor(if (activeFilterId == id) 0xFF38BDF8.toInt() else 0xFFF8FAFC.toInt())
                textSize = 15f
                setPadding(32, 28, 32, 28)
                setBackgroundResource(android.R.drawable.list_selector_background)
                setOnClickListener {
                    activeFilterId = id
                    activeTagFilter = null
                    applyFilterAndRender()
                    dialog.dismiss()
                }
            }
            container.addView(row)
        }

        dialog.setContentView(sheetView)
        dialog.show()
    }

    private fun showTagsBottomSheet() {
        val dialog = BottomSheetDialog(this)
        val sheetView = layoutInflater.inflate(R.layout.sheet_tags, null)
        val chipGroup = sheetView.findViewById<ChipGroup>(R.id.chipGroupTags)

        // Count tags
        val tagCounts = mutableMapOf<String, Int>()
        repository.bookmarks.filter { !it.isTrash }.forEach { bm ->
            bm.tags.forEach { t ->
                tagCounts[t] = (tagCounts[t] ?: 0) + 1
            }
        }

        if (tagCounts.isEmpty()) {
            val empty = TextView(this).apply {
                text = "No tags created yet."
                setTextColor(0xFF64748B.toInt())
                setPadding(16, 16, 16, 16)
            }
            chipGroup.addView(empty)
        } else {
            tagCounts.entries.sortedByDescending { it.value }.forEach { (tag, count) ->
                val chip = Chip(this).apply {
                    text = "#$tag ($count)"
                    isCheckable = false
                    setChipBackgroundColorResource(R.color.surface_dark)
                    setTextColor(0xFFE2E8F0.toInt())
                    setOnClickListener {
                        activeTagFilter = tag
                        applyFilterAndRender()
                        dialog.dismiss()
                    }
                }
                chipGroup.addView(chip)
            }
        }

        dialog.setContentView(sheetView)
        dialog.show()
    }

    private fun showAddBookmarkBottomSheet() {
        val dialog = BottomSheetDialog(this)
        val sheetView = layoutInflater.inflate(R.layout.sheet_add_bookmark, null)

        val etUrl = sheetView.findViewById<EditText>(R.id.etAddUrl)
        val etTitle = sheetView.findViewById<EditText>(R.id.etAddTitle)
        val etTags = sheetView.findViewById<EditText>(R.id.etAddTags)
        val spinnerCol = sheetView.findViewById<Spinner>(R.id.spinnerAddCollection)
        val btnFavorite = sheetView.findViewById<ImageButton>(R.id.btnAddFavorite)
        val btnCancel = sheetView.findViewById<Button>(R.id.btnCancelAdd)
        val btnSave = sheetView.findViewById<Button>(R.id.btnConfirmAdd)

        var isFavorite = false

        // Auto paste from clipboard if URL is present
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        if (clipboard.hasPrimaryClip() && clipboard.primaryClipDescription?.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) == true) {
            val clipText = clipboard.primaryClip?.getItemAt(0)?.text?.toString()?.trim() ?: ""
            if (clipText.startsWith("http://") || clipText.startsWith("https://")) {
                etUrl.setText(clipText)
                etTitle.setText(extractDomain(clipText))
            }
        }

        // Setup collections in spinner
        val colOptions = mutableListOf(Pair<String?, String>(null, "Unsorted Inbox"))
        repository.collections.filter { !it.isSystem }.forEach {
            colOptions.add(Pair(it.id, it.title))
        }
        val colAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, colOptions.map { it.second })
        spinnerCol.adapter = colAdapter

        btnFavorite.setOnClickListener {
            isFavorite = !isFavorite
            btnFavorite.setImageResource(if (isFavorite) R.drawable.ic_star_filled else R.drawable.ic_star_empty)
        }

        btnCancel.setOnClickListener { dialog.dismiss() }

        btnSave.setOnClickListener {
            val url = etUrl.text.toString().trim()
            if (url.isEmpty()) {
                Toast.makeText(this, "Please enter a valid URL", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val domain = extractDomain(url)
            val title = etTitle.text.toString().trim().ifEmpty { domain }
            val tagsInput = etTags.text.toString().trim()
            val tagsList = if (tagsInput.isNotEmpty()) {
                tagsInput.split(",").map { it.trim().removePrefix("#") }.filter { it.isNotEmpty() }
            } else emptyList()

            val selectedCol = colOptions[spinnerCol.selectedItemPosition].first

            btnSave.isEnabled = false
            btnSave.text = "Saving…"

            lifecycleScope.launch {
                val success = repository.createBookmark(
                    url = url,
                    title = title,
                    notes = null,
                    collectionId = selectedCol,
                    tags = tagsList,
                    isFavorite = isFavorite,
                    cover = null,
                    domain = domain,
                    serverUrl = getServerUrl()
                )

                if (success) {
                    Toast.makeText(this@MainActivity, "Bookmark saved!", Toast.LENGTH_SHORT).show()
                    applyFilterAndRender()
                    dialog.dismiss()
                    lifecycleScope.launch {
                        kotlinx.coroutines.delay(2500)
                        repository.syncWithServer(getServerUrl())
                        applyFilterAndRender()
                    }
                } else {
                    btnSave.isEnabled = true
                    btnSave.text = "Save"
                    Toast.makeText(this@MainActivity, "Failed to save bookmark", Toast.LENGTH_SHORT).show()
                }
            }
        }

        dialog.setContentView(sheetView)
        dialog.show()
    }

    private fun showSettingsBottomSheet() {
        val dialog = BottomSheetDialog(this)
        val sheetView = layoutInflater.inflate(R.layout.sheet_settings, null)

        val tvName = sheetView.findViewById<TextView>(R.id.tvUserName)
        val tvEmail = sheetView.findViewById<TextView>(R.id.tvUserEmail)
        val ivAvatar = sheetView.findViewById<ImageView>(R.id.ivUserAvatar)
        val tvServer = sheetView.findViewById<TextView>(R.id.tvCurrentServerUrl)
        val btnServer = sheetView.findViewById<View>(R.id.btnChangeServer)
        val btnLogout = sheetView.findViewById<Button>(R.id.btnSignOut)

        val session = AuthSession.fromJsonString(getStoredSession() ?: "")
        if (session != null) {
            tvName.text = session.name
            tvEmail.text = session.email
            if (!session.picture.isNullOrEmpty()) {
                ImageLoader.load(ivAvatar, session.picture)
            }
        }
        tvServer.text = getServerUrl()

        btnServer.setOnClickListener {
            dialog.dismiss()
            showServerConfigDialog()
        }

        btnLogout.setOnClickListener {
            dialog.dismiss()
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_AUTH_SESSION)
                .apply()
            showLoginView()
            Toast.makeText(this, "Signed out of Keepsake", Toast.LENGTH_SHORT).show()
        }

        dialog.setContentView(sheetView)
        dialog.show()
    }

    private fun showReaderDialog(bm: Bookmark) {
        val dialog = BottomSheetDialog(this, R.style.Theme_Keepsake_Dialog)
        val view = layoutInflater.inflate(R.layout.sheet_reader, null)

        view.findViewById<TextView>(R.id.tvReaderDomain).text = bm.domain
        view.findViewById<TextView>(R.id.tvReaderTitle).text = bm.title
        view.findViewById<TextView>(R.id.tvReaderBody).text = bm.readerContent ?: ""
        view.findViewById<View>(R.id.btnReaderClose).setOnClickListener {
            dialog.dismiss()
        }

        dialog.setContentView(view)
        dialog.show()
    }

    // ==========================================
    // Native Login Screen
    // ==========================================
    private fun setupLoginUI() {
        binding.etServerUrl.setText(getServerUrl())

        binding.btnGoogleSignIn.setOnClickListener {
            startGoogleSignIn()
        }

        binding.btnHeaderSettings.setOnClickListener {
            showServerConfigDialog()
        }
    }

    private fun startGoogleSignIn() {
        val inputUrl = binding.etServerUrl.text.toString().trim().removeSuffix("/")
        if (inputUrl.isEmpty()) {
            binding.tvLoginStatus.text = "Please enter your Keepsake server URL"
            binding.tvLoginStatus.visibility = View.VISIBLE
            return
        }

        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_URL, inputUrl)
            .apply()

        binding.tvLoginStatus.visibility = View.GONE
        binding.googleButtonContent.visibility = View.GONE
        binding.pbGoogleSignIn.visibility = View.VISIBLE
        binding.btnGoogleSignIn.isEnabled = false

        val authUrl = "$inputUrl/api/auth/google/url?state=android"

        try {
            val customTabsIntent = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
            customTabsIntent.launchUrl(this, Uri.parse(authUrl))
        } catch (e: Exception) {
            try {
                val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(authUrl))
                startActivity(browserIntent)
            } catch (err: Exception) {
                binding.pbGoogleSignIn.visibility = View.GONE
                binding.googleButtonContent.visibility = View.VISIBLE
                binding.btnGoogleSignIn.isEnabled = true
                binding.tvLoginStatus.text = "Failed to launch browser: ${err.localizedMessage}"
                binding.tvLoginStatus.visibility = View.VISIBLE
            }
        }
    }

    private fun showLoginView() {
        binding.nativeAppContainer.visibility = View.GONE
        binding.loginContainer.visibility = View.VISIBLE
        binding.pbGoogleSignIn.visibility = View.GONE
        binding.googleButtonContent.visibility = View.VISIBLE
        binding.tvLoginStatus.visibility = View.GONE
        binding.btnGoogleSignIn.isEnabled = true
        binding.etServerUrl.setText(getServerUrl())
    }

    private fun showNativeApp() {
        binding.loginContainer.visibility = View.GONE
        binding.nativeAppContainer.visibility = View.VISIBLE
    }

    private fun getStoredSession(): String? {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_AUTH_SESSION, null)
    }

    private fun getServerUrl(): String {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
    }

    fun showServerConfigDialog() {
        val current = getServerUrl()
        val input = EditText(this).apply {
            setText(current)
            hint = "https://keepsake.example.com or http://10.0.2.2:3000"
            setPadding(36, 24, 36, 24)
        }

        AlertDialog.Builder(this)
            .setTitle("Keepsake Server URL")
            .setMessage("Configure your Keepsake server address:")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                val newUrl = input.text.toString().trim().removeSuffix("/")
                if (newUrl.isNotEmpty()) {
                    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_SERVER_URL, newUrl)
                        .apply()
                    binding.etServerUrl.setText(newUrl)
                    if (binding.nativeAppContainer.visibility == View.VISIBLE) {
                        syncBookmarks()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun extractDomain(urlStr: String): String {
        return try {
            val uri = Uri.parse(urlStr)
            uri.host?.removePrefix("www.") ?: urlStr
        } catch (e: Exception) {
            urlStr
        }
    }
}
