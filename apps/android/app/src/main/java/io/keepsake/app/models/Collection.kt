package io.keepsake.app.models

import org.json.JSONObject

data class Collection(
    val id: String,
    val title: String,
    val slug: String? = null,
    val description: String? = null,
    val parentId: String? = null,
    val color: String? = null,
    val icon: String? = null,
    val isSystem: Boolean = false,
    val sortOrder: Int = 0,
    val createdAt: String = "",
    val updatedAt: String = ""
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("id", id)
            put("title", title)
            put("slug", slug ?: JSONObject.NULL)
            put("description", description ?: JSONObject.NULL)
            put("parentId", parentId ?: JSONObject.NULL)
            put("color", color ?: JSONObject.NULL)
            put("icon", icon ?: JSONObject.NULL)
            put("isSystem", isSystem)
            put("sortOrder", sortOrder)
            put("createdAt", createdAt)
            put("updatedAt", updatedAt)
        }
    }

    companion object {
        fun fromJson(obj: JSONObject): Collection {
            return Collection(
                id = obj.optString("id", ""),
                title = obj.optString("title", "Collection"),
                slug = obj.optString("slug").takeIf { it.isNotEmpty() && it != "null" },
                description = obj.optString("description").takeIf { it.isNotEmpty() && it != "null" },
                parentId = obj.optString("parentId").takeIf { it.isNotEmpty() && it != "null" },
                color = obj.optString("color").takeIf { it.isNotEmpty() && it != "null" } ?: "#38BDF8",
                icon = obj.optString("icon").takeIf { it.isNotEmpty() && it != "null" } ?: "Folder",
                isSystem = obj.optBoolean("isSystem", false),
                sortOrder = obj.optInt("sortOrder", 0),
                createdAt = obj.optString("createdAt", ""),
                updatedAt = obj.optString("updatedAt", "")
            )
        }
    }
}
