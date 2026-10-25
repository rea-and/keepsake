package io.keepsake.app

import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
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
            popup.menu.add("Edit Bookmark")
            popup.menu.add("Move to Collection")
            popup.menu.add("Edit Tags")
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
                "Edit Bookmark" -> {
                    showEditBookmarkDialog(bm)
                    true
                }
                "Edit Tags" -> {
                    showBookmarkTagsDialog(bm)
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
        val options = mutableListOf(
            Pair("+new", "+ New Collection"),
            Pair("unsorted", "Unsorted Inbox")
        )
        repository.collections.filter { !it.isSystem }.sortedBy { it.sortOrder }.forEach {
            options.add(Pair(it.id, it.title))
        }

        val titles = options.map { it.second }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Move to Collection")
            .setItems(titles) { _, which ->
                val targetId = options[which].first
                if (targetId == "+new") {
                    showEditCollectionDialog(null) {
                        showMoveToCollectionDialog(bm)
                    }
                } else {
                    lifecycleScope.launch {
                        repository.moveBookmark(bm.id, if (targetId == "unsorted") null else targetId, getServerUrl())
                        applyFilterAndRender()
                        Toast.makeText(this@MainActivity, "Moved to ${options[which].second}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showEditBookmarkDialog(bm: Bookmark) {
        val dialog = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.dialog_edit_bookmark, null)

        val etTitle = view.findViewById<EditText>(R.id.etEditBookmarkTitle)
        val etUrl = view.findViewById<EditText>(R.id.etEditBookmarkUrl)
        val etTags = view.findViewById<EditText>(R.id.etEditBookmarkTags)
        val etNotes = view.findViewById<EditText>(R.id.etEditBookmarkNotes)
        val spinnerCol = view.findViewById<Spinner>(R.id.spinnerEditBookmarkCollection)
        val btnQuickNewCol = view.findViewById<Button>(R.id.btnEditBookmarkNewCollection)
        val btnFavorite = view.findViewById<ImageButton>(R.id.btnEditBookmarkFavorite)
        val btnClose = view.findViewById<ImageButton>(R.id.btnCloseEditBookmarkDialog)
        val btnCancel = view.findViewById<Button>(R.id.btnCancelEditBookmark)
        val btnSave = view.findViewById<Button>(R.id.btnSaveEditBookmark)

        etTitle.setText(bm.title)
        etUrl.setText(bm.url)
        etTags.setText(bm.tags.joinToString(", "))
        etNotes.setText(bm.note ?: bm.description ?: "")

        var isFav = bm.isFavorite
        fun updateFavIcon() {
            btnFavorite.setImageResource(if (isFav) R.drawable.ic_star_filled else R.drawable.ic_star_empty)
        }
        updateFavIcon()
        btnFavorite.setOnClickListener {
            isFav = !isFav
            updateFavIcon()
        }

        val colOptions = mutableListOf<Pair<String?, String>>()
        fun setupSpinner(targetSelectId: String? = bm.collectionId) {
            colOptions.clear()
            colOptions.add(Pair(null, "Unsorted Inbox"))
            repository.collections.filter { !it.isSystem }.sortedBy { it.sortOrder }.forEach {
                colOptions.add(Pair(it.id, it.title))
            }
            val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, colOptions.map { it.second })
            spinnerCol.adapter = adapter

            val idx = colOptions.indexOfFirst { it.first == targetSelectId }
            if (idx != -1) {
                spinnerCol.setSelection(idx)
            }
        }
        setupSpinner()

        btnQuickNewCol.setOnClickListener {
            showEditCollectionDialog(null) {
                setupSpinner(colOptions.lastOrNull()?.first)
            }
        }

        btnClose.setOnClickListener { dialog.dismiss() }
        btnCancel.setOnClickListener { dialog.dismiss() }

        btnSave.setOnClickListener {
            val title = etTitle.text.toString().trim()
            val url = etUrl.text.toString().trim()
            if (url.isEmpty()) {
                Toast.makeText(this, "Please enter a valid URL", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val tagsList = etTags.text.toString().split(",")
                .map { it.trim().removePrefix("#") }
                .filter { it.isNotEmpty() }
            val selectedCol = colOptions[spinnerCol.selectedItemPosition].first
            val notes = etNotes.text.toString().trim().ifEmpty { null }

            btnSave.isEnabled = false
            lifecycleScope.launch {
                val ok = repository.updateBookmark(
                    bookmarkId = bm.id,
                    url = url,
                    title = title.ifEmpty { extractDomain(url) },
                    description = notes ?: bm.description,
                    note = notes ?: bm.note,
                    collectionId = selectedCol,
                    tags = tagsList,
                    isFavorite = isFav,
                    serverUrl = getServerUrl()
                )
                if (ok) {
                    Toast.makeText(this@MainActivity, "Bookmark updated!", Toast.LENGTH_SHORT).show()
                    applyFilterAndRender()
                    dialog.dismiss()
                } else {
                    btnSave.isEnabled = true
                    Toast.makeText(this@MainActivity, "Failed to update bookmark", Toast.LENGTH_SHORT).show()
                }
            }
        }

        dialog.setContentView(view)
        dialog.show()
    }

    private fun showBookmarkTagsDialog(bm: Bookmark) {
        val dialog = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.dialog_bookmark_tags, null)

        val tvSub = view.findViewById<TextView>(R.id.tvBookmarkTagsSub)
        val cgTags = view.findViewById<ChipGroup>(R.id.cgBookmarkTags)
        val etInput = view.findViewById<EditText>(R.id.etAddTagInput)
        val btnAdd = view.findViewById<Button>(R.id.btnAddTagButton)
        val btnClose = view.findViewById<ImageButton>(R.id.btnCloseBookmarkTagsDialog)
        val btnDone = view.findViewById<Button>(R.id.btnDoneBookmarkTags)

        tvSub.text = "Tags for \"${bm.title}\""
        val currentTags = bm.tags.toMutableList()

        fun renderChips() {
            cgTags.removeAllViews()
            if (currentTags.isEmpty()) {
                val empty = TextView(this).apply {
                    text = "No tags on this bookmark yet."
                    setTextColor(0xFF64748B.toInt())
                    setPadding(8, 8, 8, 8)
                }
                cgTags.addView(empty)
            } else {
                currentTags.forEach { t ->
                    val chip = Chip(this).apply {
                        text = "#$t"
                        isCheckable = false
                        setChipBackgroundColorResource(R.color.surface_dark)
                        setTextColor(0xFFE2E8F0.toInt())
                        isCloseIconVisible = true
                        setCloseIconResource(R.drawable.ic_close)
                        setCloseIconTint(ColorStateList.valueOf(0xFF94A3B8.toInt()))
                        setOnCloseIconClickListener {
                            currentTags.remove(t)
                            lifecycleScope.launch {
                                repository.updateBookmarkTags(bm.id, currentTags, getServerUrl())
                                applyFilterAndRender()
                            }
                            renderChips()
                        }
                    }
                    cgTags.addView(chip)
                }
            }
        }

        renderChips()

        btnAdd.setOnClickListener {
            val newTag = etInput.text.toString().trim().lowercase().removePrefix("#")
            if (newTag.isNotEmpty() && !currentTags.contains(newTag)) {
                currentTags.add(newTag)
                etInput.setText("")
                lifecycleScope.launch {
                    repository.updateBookmarkTags(bm.id, currentTags, getServerUrl())
                    applyFilterAndRender()
                }
                renderChips()
            }
        }

        btnClose.setOnClickListener { dialog.dismiss() }
        btnDone.setOnClickListener { dialog.dismiss() }

        dialog.setContentView(view)
        dialog.show()
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
    // Native Bottom Sheets (Collections & Tags)
    // ==========================================
    private fun showCollectionsBottomSheet() {
        val dialog = BottomSheetDialog(this)
        val sheetView = layoutInflater.inflate(R.layout.sheet_collections, null)
        val container = sheetView.findViewById<LinearLayout>(R.id.llCollectionsList)
        val btnAddNew = sheetView.findViewById<Button>(R.id.btnAddNewCollection)

        btnAddNew.setOnClickListener {
            showEditCollectionDialog(null) {
                dialog.dismiss()
            }
        }

        fun populateList() {
            container.removeAllViews()

            // System Collections
            val systemItems = listOf(
                Pair("all", "All Bookmarks"),
                Pair("unsorted", "Unsorted Inbox"),
                Pair("favorites", "Favorites"),
                Pair("trash", "Trash")
            )

            systemItems.forEach { (id, title) ->
                val count = repository.bookmarks.count { bm ->
                    when (id) {
                        "all" -> !bm.isTrash
                        "unsorted" -> !bm.isTrash && (bm.collectionId == null || bm.collectionId == "unsorted")
                        "favorites" -> !bm.isTrash && bm.isFavorite
                        "trash" -> bm.isTrash
                        else -> false
                    }
                }
                val row = TextView(this).apply {
                    text = "$title ($count)"
                    setTextColor(if (activeFilterId == id && activeTagFilter == null) 0xFF38BDF8.toInt() else 0xFFF8FAFC.toInt())
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

            // Divider / Section Header
            val customCols = repository.collections.filter { !it.isSystem }.sortedBy { it.sortOrder }
            val sectionHeader = TextView(this).apply {
                text = "MY CATEGORIES (${customCols.size})"
                setTextColor(0xFF64748B.toInt())
                textSize = 11f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(32, 24, 32, 12)
            }
            container.addView(sectionHeader)

            if (customCols.isEmpty()) {
                val emptyView = TextView(this).apply {
                    text = "No custom categories yet.\nTap '+ New Collection' above to create one."
                    setTextColor(0xFF64748B.toInt())
                    textSize = 13f
                    setPadding(32, 16, 32, 24)
                }
                container.addView(emptyView)
            } else {
                customCols.forEachIndexed { index, col ->
                    val rowView = layoutInflater.inflate(R.layout.item_collection_manage, container, false)
                    val tvTitle = rowView.findViewById<TextView>(R.id.tvCollectionTitle)
                    val tvCount = rowView.findViewById<TextView>(R.id.tvCollectionCount)
                    val vDot = rowView.findViewById<View>(R.id.vCollectionColorDot)
                    val btnMoveUp = rowView.findViewById<ImageButton>(R.id.btnMoveUp)
                    val btnMoveDown = rowView.findViewById<ImageButton>(R.id.btnMoveDown)
                    val btnEdit = rowView.findViewById<ImageButton>(R.id.btnEditCollection)
                    val llInfo = rowView.findViewById<View>(R.id.llCollectionInfo)

                    btnMoveUp.visibility = if (index > 0) View.VISIBLE else View.INVISIBLE
                    btnMoveDown.visibility = if (index < customCols.size - 1) View.VISIBLE else View.INVISIBLE

                    btnMoveUp.setOnClickListener {
                        val reordered = customCols.toMutableList()
                        val item = reordered.removeAt(index)
                        reordered.add(index - 1, item)
                        lifecycleScope.launch {
                            repository.reorderCollections(reordered, getServerUrl())
                            populateList()
                        }
                    }

                    btnMoveDown.setOnClickListener {
                        val reordered = customCols.toMutableList()
                        val item = reordered.removeAt(index)
                        reordered.add(index + 1, item)
                        lifecycleScope.launch {
                            repository.reorderCollections(reordered, getServerUrl())
                            populateList()
                        }
                    }

                    tvTitle.text = col.title
                    if (activeFilterId == col.id && activeTagFilter == null) {
                        tvTitle.setTextColor(0xFF38BDF8.toInt())
                    }

                    val bmCount = repository.bookmarks.count { !it.isTrash && it.collectionId == col.id }
                    val desc = if (!col.description.isNullOrEmpty()) "${col.description} • " else ""
                    tvCount.text = "$desc$bmCount bookmarks"

                    val colColor = try {
                        Color.parseColor(col.color ?: "#38BDF8")
                    } catch (e: Exception) {
                        0xFF38BDF8.toInt()
                    }
                    val dot = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(colColor)
                    }
                    vDot.background = dot

                    val clickFilter = View.OnClickListener {
                        activeFilterId = col.id
                        activeTagFilter = null
                        applyFilterAndRender()
                        dialog.dismiss()
                    }
                    rowView.setOnClickListener(clickFilter)
                    llInfo.setOnClickListener(clickFilter)

                    btnEdit.setOnClickListener {
                        showEditCollectionDialog(col) {
                            dialog.dismiss()
                        }
                    }

                    container.addView(rowView)
                }
            }
        }

        populateList()
        dialog.setContentView(sheetView)
        dialog.show()
    }

    private fun showEditCollectionDialog(col: Collection?, onDismissParent: (() -> Unit)? = null) {
        val dialog = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.dialog_edit_collection, null)

        val tvTitle = view.findViewById<TextView>(R.id.tvEditCollectionDialogTitle)
        val btnClose = view.findViewById<ImageButton>(R.id.btnCloseCollectionDialog)
        val etTitle = view.findViewById<EditText>(R.id.etCollectionTitle)
        val etDesc = view.findViewById<EditText>(R.id.etCollectionDescription)
        val llPalette = view.findViewById<LinearLayout>(R.id.llColorPalette)
        val btnDelete = view.findViewById<Button>(R.id.btnDeleteCollection)
        val btnCancel = view.findViewById<Button>(R.id.btnCancelCollection)
        val btnSave = view.findViewById<Button>(R.id.btnSaveCollection)

        tvTitle.text = if (col == null) "New Collection" else "Edit Collection"
        btnSave.text = if (col == null) "Create" else "Save Changes"

        if (col != null) {
            etTitle.setText(col.title)
            etDesc.setText(col.description ?: "")
            btnDelete.visibility = View.VISIBLE
        } else {
            btnDelete.visibility = View.GONE
        }

        val palette = listOf(
            "#0284c7", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
            "#f97316", "#eab308", "#10b981", "#06b6d4", "#737373"
        )
        var selectedColor = col?.color ?: "#0284c7"

        fun renderColorPalette() {
            llPalette.removeAllViews()
            val density = resources.displayMetrics.density
            val size = (36 * density).toInt()
            val margin = (4 * density).toInt()

            palette.forEach { hex ->
                val colorView = FrameLayout(this).apply {
                    layoutParams = LinearLayout.LayoutParams(size, size).apply {
                        setMargins(margin, margin, margin, margin)
                    }
                    val parsed = try { Color.parseColor(hex) } catch (e: Exception) { 0xFF0284C7.toInt() }
                    val isSelected = selectedColor.equals(hex, ignoreCase = true)

                    val bg = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(parsed)
                        if (isSelected) {
                            setStroke((3 * density).toInt(), Color.WHITE)
                        }
                    }
                    background = bg

                    if (isSelected) {
                        val check = ImageView(context).apply {
                            setImageResource(R.drawable.ic_check)
                            val pad = (8 * density).toInt()
                            setPadding(pad, pad, pad, pad)
                        }
                        addView(check)
                    }

                    setOnClickListener {
                        selectedColor = hex
                        renderColorPalette()
                    }
                }
                llPalette.addView(colorView)
            }
        }
        renderColorPalette()

        btnClose.setOnClickListener { dialog.dismiss() }
        btnCancel.setOnClickListener { dialog.dismiss() }

        btnDelete.setOnClickListener {
            if (col == null) return@setOnClickListener
            AlertDialog.Builder(this)
                .setTitle("Delete Collection")
                .setMessage("Delete \"${col.title}\"? All bookmarks in this collection will be moved to Unsorted.")
                .setPositiveButton("Delete") { _, _ ->
                    lifecycleScope.launch {
                        repository.deleteCollection(col.id, getServerUrl())
                        if (activeFilterId == col.id) {
                            activeFilterId = "all"
                        }
                        applyFilterAndRender()
                        dialog.dismiss()
                        onDismissParent?.invoke()
                        Toast.makeText(this@MainActivity, "Collection deleted", Toast.LENGTH_SHORT).show()
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        btnSave.setOnClickListener {
            val title = etTitle.text.toString().trim()
            if (title.isEmpty()) {
                Toast.makeText(this, "Please enter a collection name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val desc = etDesc.text.toString().trim().ifEmpty { null }

            btnSave.isEnabled = false
            lifecycleScope.launch {
                if (col == null) {
                    val created = repository.createCollection(
                        title = title,
                        description = desc,
                        color = selectedColor,
                        icon = "Folder",
                        serverUrl = getServerUrl()
                    )
                    if (created != null) {
                        Toast.makeText(this@MainActivity, "Collection created!", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "Failed to create collection", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    val updated = repository.updateCollection(
                        id = col.id,
                        title = title,
                        description = desc,
                        color = selectedColor,
                        icon = col.icon ?: "Folder",
                        serverUrl = getServerUrl()
                    )
                    if (updated) {
                        Toast.makeText(this@MainActivity, "Collection updated!", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@MainActivity, "Failed to update collection", Toast.LENGTH_SHORT).show()
                    }
                }
                applyFilterAndRender()
                dialog.dismiss()
                onDismissParent?.invoke()
            }
        }

        dialog.setContentView(view)
        dialog.show()
    }

    private fun showTagsBottomSheet() {
        val dialog = BottomSheetDialog(this)
        val sheetView = layoutInflater.inflate(R.layout.sheet_tags, null)
        val chipGroup = sheetView.findViewById<ChipGroup>(R.id.chipGroupTags)
        val btnAddNewTag = sheetView.findViewById<Button>(R.id.btnAddNewTag)

        btnAddNewTag.setOnClickListener {
            showCreateTagDialog {
                dialog.dismiss()
            }
        }

        // Count tags
        val tagCounts = mutableMapOf<String, Int>()
        repository.bookmarks.filter { !it.isTrash }.forEach { bm ->
            bm.tags.forEach { t ->
                val clean = t.trim().lowercase().removePrefix("#")
                if (clean.isNotEmpty()) {
                    tagCounts[clean] = (tagCounts[clean] ?: 0) + 1
                }
            }
        }

        if (tagCounts.isEmpty()) {
            val empty = TextView(this).apply {
                text = "No tags created yet.\nTap '+ New Tag' above to create one."
                setTextColor(0xFF64748B.toInt())
                setPadding(16, 24, 16, 24)
            }
            chipGroup.addView(empty)
        } else {
            tagCounts.entries.sortedByDescending { it.value }.forEach { (tag, count) ->
                val chip = Chip(this).apply {
                    text = "#$tag ($count)"
                    isCheckable = false
                    setChipBackgroundColorResource(R.color.surface_dark)
                    setTextColor(0xFFE2E8F0.toInt())
                    isCloseIconVisible = true
                    setCloseIconResource(R.drawable.ic_edit)
                    setCloseIconTint(ColorStateList.valueOf(0xFF94A3B8.toInt()))

                    setOnCloseIconClickListener {
                        showEditTagDialog(tag, count) {
                            dialog.dismiss()
                        }
                    }

                    setOnLongClickListener {
                        showEditTagDialog(tag, count) {
                            dialog.dismiss()
                        }
                        true
                    }

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

    private fun showCreateTagDialog(onDismissParent: (() -> Unit)? = null) {
        val activeBookmarks = repository.bookmarks.filter { !it.isTrash }
        if (activeBookmarks.isEmpty()) {
            Toast.makeText(this, "Please add a bookmark first before creating tags", Toast.LENGTH_SHORT).show()
            return
        }

        val dialog = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.dialog_create_tag, null)

        val etTagName = view.findViewById<EditText>(R.id.etNewTagName)
        val spinnerBookmark = view.findViewById<Spinner>(R.id.spinnerTargetBookmark)
        val btnClose = view.findViewById<ImageButton>(R.id.btnCloseCreateTagDialog)
        val btnCancel = view.findViewById<Button>(R.id.btnCancelCreateTag)
        val btnConfirm = view.findViewById<Button>(R.id.btnConfirmCreateTag)

        val bmTitles = activeBookmarks.map { bm ->
            if (bm.title.isNotEmpty()) bm.title else bm.domain
        }
        val bmAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, bmTitles)
        spinnerBookmark.adapter = bmAdapter

        btnClose.setOnClickListener { dialog.dismiss() }
        btnCancel.setOnClickListener { dialog.dismiss() }

        btnConfirm.setOnClickListener {
            val tag = etTagName.text.toString().trim().lowercase().removePrefix("#")
            if (tag.isEmpty()) {
                Toast.makeText(this, "Please enter a tag name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val targetBm = activeBookmarks[spinnerBookmark.selectedItemPosition]
            btnConfirm.isEnabled = false

            lifecycleScope.launch {
                repository.addTag(targetBm.id, tag, getServerUrl())
                Toast.makeText(this@MainActivity, "Tag #$tag created and added to \"${targetBm.title}\"", Toast.LENGTH_SHORT).show()
                applyFilterAndRender()
                dialog.dismiss()
                onDismissParent?.invoke()
            }
        }

        dialog.setContentView(view)
        dialog.show()
    }

    private fun showEditTagDialog(tag: String, count: Int, onDismissParent: (() -> Unit)? = null) {
        val dialog = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.dialog_edit_tag, null)

        val tvTitle = view.findViewById<TextView>(R.id.tvEditTagDialogTitle)
        val tvSub = view.findViewById<TextView>(R.id.tvTagUsageCount)
        val etName = view.findViewById<EditText>(R.id.etTagName)
        val btnClose = view.findViewById<ImageButton>(R.id.btnCloseTagDialog)
        val btnDelete = view.findViewById<Button>(R.id.btnDeleteTag)
        val btnCancel = view.findViewById<Button>(R.id.btnCancelTag)
        val btnSave = view.findViewById<Button>(R.id.btnSaveTag)

        tvTitle.text = "Edit Tag: #$tag"
        tvSub.text = "Used in $count bookmark(s)"
        etName.setText(tag)

        btnClose.setOnClickListener { dialog.dismiss() }
        btnCancel.setOnClickListener { dialog.dismiss() }

        btnDelete.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Delete Tag")
                .setMessage("Delete tag \"#$tag\"? It will be removed from $count bookmark(s).")
                .setPositiveButton("Delete") { _, _ ->
                    lifecycleScope.launch {
                        val deletedCount = repository.deleteTag(tag, getServerUrl())
                        if (activeTagFilter == tag) {
                            activeTagFilter = null
                        }
                        applyFilterAndRender()
                        dialog.dismiss()
                        onDismissParent?.invoke()
                        Toast.makeText(this@MainActivity, "Tag #$tag removed from $deletedCount bookmark(s)", Toast.LENGTH_SHORT).show()
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        btnSave.setOnClickListener {
            val newTag = etName.text.toString().trim().lowercase().removePrefix("#")
            if (newTag.isEmpty()) {
                Toast.makeText(this, "Please enter a valid tag name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (newTag == tag) {
                dialog.dismiss()
                return@setOnClickListener
            }

            btnSave.isEnabled = false
            lifecycleScope.launch {
                val renamedCount = repository.renameTag(tag, newTag, getServerUrl())
                if (activeTagFilter == tag) {
                    activeTagFilter = newTag
                }
                applyFilterAndRender()
                dialog.dismiss()
                onDismissParent?.invoke()
                Toast.makeText(this@MainActivity, "Renamed #$tag to #$newTag on $renamedCount bookmark(s)", Toast.LENGTH_SHORT).show()
            }
        }

        dialog.setContentView(view)
        dialog.show()
    }

    private fun showAddBookmarkBottomSheet() {
        val dialog = BottomSheetDialog(this)
        val sheetView = layoutInflater.inflate(R.layout.sheet_add_bookmark, null)

        val etUrl = sheetView.findViewById<EditText>(R.id.etAddUrl)
        val etTitle = sheetView.findViewById<EditText>(R.id.etAddTitle)
        val etTags = sheetView.findViewById<EditText>(R.id.etAddTags)
        val spinnerCol = sheetView.findViewById<Spinner>(R.id.spinnerAddCollection)
        val btnQuickAddCol = sheetView.findViewById<Button>(R.id.btnQuickAddCollection)
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
        fun refreshColOptions() {
            colOptions.clear()
            colOptions.add(Pair(null, "Unsorted Inbox"))
            repository.collections.filter { !it.isSystem }.sortedBy { it.sortOrder }.forEach {
                colOptions.add(Pair(it.id, it.title))
            }
        }
        refreshColOptions()

        val colAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, colOptions.map { it.second })
        spinnerCol.adapter = colAdapter

        btnQuickAddCol?.setOnClickListener {
            showEditCollectionDialog(null) {
                refreshColOptions()
                colAdapter.clear()
                colAdapter.addAll(colOptions.map { it.second })
                colAdapter.notifyDataSetChanged()
                if (colOptions.size > 1) {
                    spinnerCol.setSelection(colOptions.size - 1)
                }
            }
        }

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
