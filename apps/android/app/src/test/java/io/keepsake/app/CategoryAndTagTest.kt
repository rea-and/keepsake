package io.keepsake.app

import io.keepsake.app.models.Bookmark
import io.keepsake.app.models.Collection
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CategoryAndTagTest {

    @Test
    fun testCollectionModelSerialization() {
        val col = Collection(
            id = "col_test123",
            title = "Design Resources",
            slug = "design-resources",
            description = "Figma, icons, colors",
            color = "#0284C7",
            icon = "Folder",
            isSystem = false,
            sortOrder = 1,
            createdAt = "2026-10-23T00:00:00.000Z",
            updatedAt = "2026-10-23T00:00:00.000Z"
        )

        val json = col.toJson()
        assertEquals("col_test123", json.getString("id"))
        assertEquals("Design Resources", json.getString("title"))
        assertEquals("design-resources", json.getString("slug"))
        assertEquals("Figma, icons, colors", json.getString("description"))
        assertEquals("#0284C7", json.getString("color"))
        assertEquals("Folder", json.getString("icon"))
        assertFalse(json.getBoolean("isSystem"))

        val deserialized = Collection.fromJson(json)
        assertEquals(col.id, deserialized.id)
        assertEquals(col.title, deserialized.title)
        assertEquals("design-resources", deserialized.slug)
        assertEquals(col.description, deserialized.description)
        assertEquals(col.color, deserialized.color)
        assertEquals(col.icon, deserialized.icon)
        assertEquals(col.isSystem, deserialized.isSystem)
    }

    @Test
    fun testBookmarkTagAndCollectionAssignment() {
        val bm = Bookmark(
            id = "bm_test123",
            url = "https://example.com/article",
            title = "Example Article",
            description = "A useful article",
            note = "My personal reading note",
            domain = "example.com",
            favicon = "https://example.com/favicon.ico",
            cover = null,
            collectionId = "col_test123",
            tags = listOf("tech", "kotlin", "android"),
            isFavorite = true,
            isTrash = false,
            type = "article",
            readerContent = "Sample content",
            createdAt = "2026-10-23T00:00:00.000Z",
            updatedAt = "2026-10-23T00:00:00.000Z"
        )

        val json = bm.toJson()
        assertEquals("col_test123", json.getString("collectionId"))
        assertEquals("My personal reading note", json.getString("note"))
        val tagsArr = json.getJSONArray("tags")
        assertEquals(3, tagsArr.length())
        assertEquals("tech", tagsArr.getString(0))
        assertEquals("kotlin", tagsArr.getString(1))
        assertEquals("android", tagsArr.getString(2))

        val deserialized = Bookmark.fromJson(json)
        assertEquals(listOf("tech", "kotlin", "android"), deserialized.tags)
        assertEquals("col_test123", deserialized.collectionId)
        assertEquals("My personal reading note", deserialized.note)
        assertTrue(deserialized.isFavorite)
    }

    @Test
    fun testTagRenamingLogic() {
        val bm1 = Bookmark(
            id = "bm_1",
            url = "https://kotlinlang.org",
            title = "Kotlin",
            description = null,
            domain = "kotlinlang.org",
            favicon = null,
            cover = null,
            collectionId = "col_dev",
            tags = listOf("dev", "jvm", "kotlin"),
            isFavorite = false,
            isTrash = false,
            type = "link",
            readerContent = null,
            createdAt = "2026-10-23T00:00:00.000Z",
            updatedAt = "2026-10-23T00:00:00.000Z"
        )

        val bm2 = Bookmark(
            id = "bm_2",
            url = "https://android.com",
            title = "Android",
            description = null,
            domain = "android.com",
            favicon = null,
            cover = null,
            collectionId = "col_mobile",
            tags = listOf("mobile", "dev"),
            isFavorite = false,
            isTrash = false,
            type = "link",
            readerContent = null,
            createdAt = "2026-10-23T00:00:00.000Z",
            updatedAt = "2026-10-23T00:00:00.000Z"
        )

        val bookmarks = mutableListOf(bm1, bm2)

        // Rename tag "dev" to "engineering"
        val oldTag = "dev"
        val newTag = "engineering"
        for (i in 0 until bookmarks.size) {
            val bm = bookmarks[i]
            if (bm.tags.any { it.equals(oldTag, ignoreCase = true) }) {
                val nextTags = bm.tags.map { if (it.equals(oldTag, ignoreCase = true)) newTag else it }.distinct()
                bookmarks[i] = bm.copy(tags = nextTags)
            }
        }

        assertEquals(listOf("engineering", "jvm", "kotlin"), bookmarks[0].tags)
        assertEquals(listOf("mobile", "engineering"), bookmarks[1].tags)
    }

    @Test
    fun testTagDeletionLogic() {
        val bm = Bookmark(
            id = "bm_1",
            url = "https://example.com",
            title = "Example",
            description = null,
            domain = "example.com",
            favicon = null,
            cover = null,
            collectionId = null,
            tags = listOf("temp", "reading", "ai"),
            isFavorite = false,
            isTrash = false,
            type = "link",
            readerContent = null,
            createdAt = "2026-10-23T00:00:00.000Z",
            updatedAt = "2026-10-23T00:00:00.000Z"
        )

        val nextTags = bm.tags.filterNot { it.equals("temp", ignoreCase = true) }
        val updated = bm.copy(tags = nextTags)

        assertEquals(listOf("reading", "ai"), updated.tags)
        assertFalse(updated.tags.contains("temp"))
    }

    @Test
    fun testCollectionDeletionMovesBookmarksToUnsorted() {
        val colToDeleteId = "col_remove_me"
        val bm1 = Bookmark(
            id = "bm_1",
            url = "https://example1.com",
            title = "Ex1",
            description = null,
            domain = "example1.com",
            favicon = null,
            cover = null,
            collectionId = colToDeleteId,
            tags = emptyList(),
            isFavorite = false,
            isTrash = false,
            type = "link",
            readerContent = null,
            createdAt = "2026-10-23T00:00:00.000Z",
            updatedAt = "2026-10-23T00:00:00.000Z"
        )

        val bm2 = Bookmark(
            id = "bm_2",
            url = "https://example2.com",
            title = "Ex2",
            description = null,
            domain = "example2.com",
            favicon = null,
            cover = null,
            collectionId = "col_keep_me",
            tags = emptyList(),
            isFavorite = false,
            isTrash = false,
            type = "link",
            readerContent = null,
            createdAt = "2026-10-23T00:00:00.000Z",
            updatedAt = "2026-10-23T00:00:00.000Z"
        )

        val bookmarks = mutableListOf(bm1, bm2)
        for (i in 0 until bookmarks.size) {
            if (bookmarks[i].collectionId == colToDeleteId) {
                bookmarks[i] = bookmarks[i].copy(collectionId = null)
            }
        }

        assertNull(bookmarks[0].collectionId)
        assertEquals("col_keep_me", bookmarks[1].collectionId)
    }

    @Test
    fun testCollectionReordering() {
        val col1 = Collection(id = "1", title = "First", sortOrder = 0)
        val col2 = Collection(id = "2", title = "Second", sortOrder = 1)
        val col3 = Collection(id = "3", title = "Third", sortOrder = 2)

        val list = mutableListOf(col1, col2, col3)
        // Move Third to First
        val moved = list.removeAt(2)
        list.add(0, moved)

        val reordered = list.mapIndexed { idx, item -> item.copy(sortOrder = idx) }
        assertEquals("3", reordered[0].id)
        assertEquals(0, reordered[0].sortOrder)
        assertEquals("1", reordered[1].id)
        assertEquals(1, reordered[1].sortOrder)
        assertEquals("2", reordered[2].id)
        assertEquals(2, reordered[2].sortOrder)
    }
}
