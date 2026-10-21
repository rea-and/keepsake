package io.keepsake.app.models

import org.json.JSONArray
import org.json.JSONObject

data class Bookmark(
    val id: String,
    val url: String,
    val title: String,
    val description: String?,
    val domain: String,
    val favicon: String?,
    val cover: String?,
    val collectionId: String?,
    val tags: List<String>,
    val isFavorite: Boolean,
    val isTrash: Boolean,
    val type: String,
    val readerContent: String?,
    val createdAt: String,
    val updatedAt: String
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("id", id)
            put("url", url)
            put("title", title)
            put("description", description ?: JSONObject.NULL)
            put("domain", domain)
            put("favicon", favicon ?: JSONObject.NULL)
            put("cover", cover ?: JSONObject.NULL)
            put("collectionId", collectionId ?: JSONObject.NULL)
            val tagsArr = JSONArray()
            tags.forEach { tagsArr.put(it) }
            put("tags", tagsArr)
            put("isFavorite", isFavorite)
            put("isTrash", isTrash)
            put("type", type)
            put("readerContent", readerContent ?: JSONObject.NULL)
            put("createdAt", createdAt)
            put("updatedAt", updatedAt)
        }
    }

    companion object {
        fun fromJson(obj: JSONObject): Bookmark {
            val tagsList = mutableListOf<String>()
            val tagsArr = obj.optJSONArray("tags")
            if (tagsArr != null) {
                for (i in 0 until tagsArr.length()) {
                    val t = tagsArr.optString(i)
                    if (t.isNotEmpty()) tagsList.add(t)
                }
            }

            return Bookmark(
                id = obj.optString("id", ""),
                url = obj.optString("url", ""),
                title = obj.optString("title", obj.optString("url", "")),
                description = obj.optString("description").takeIf { it.isNotEmpty() && it != "null" },
                domain = obj.optString("domain", ""),
                favicon = obj.optString("favicon").takeIf { it.isNotEmpty() && it != "null" },
                cover = obj.optString("cover").takeIf { it.isNotEmpty() && it != "null" },
                collectionId = obj.optString("collectionId").takeIf { it.isNotEmpty() && it != "null" },
                tags = tagsList,
                isFavorite = obj.optBoolean("isFavorite", false),
                isTrash = obj.optBoolean("isTrash", false),
                type = obj.optString("type", "link"),
                readerContent = obj.optString("readerContent").takeIf { it.isNotEmpty() && it != "null" },
                createdAt = obj.optString("createdAt", ""),
                updatedAt = obj.optString("updatedAt", "")
            )
        }
    }
}
