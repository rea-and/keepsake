package io.keepsake.app.utils

import io.keepsake.app.models.Collection

data class CollectionTreeItem(val collection: Collection, val depth: Int) {
    val label: String get() = "— ".repeat(depth.coerceAtMost(8)) + collection.title
}

fun flattenCollections(collections: List<Collection>): List<CollectionTreeItem> {
    val custom = collections.filter { !it.isSystem && it.id != "unsorted" }
        .sortedWith(compareBy<Collection> { it.sortOrder }.thenBy { it.id })
    val ids = custom.map { it.id }.toSet()
    val children = custom.groupBy { it.parentId?.takeIf(ids::contains) }
    val visited = mutableSetOf<String>()
    val result = mutableListOf<CollectionTreeItem>()
    fun visit(collection: Collection, depth: Int) {
        if (!visited.add(collection.id)) return
        result.add(CollectionTreeItem(collection, depth))
        children[collection.id]?.forEach { visit(it, depth + 1) }
    }
    children[null]?.forEach { visit(it, 0) }
    custom.forEach { visit(it, 0) }
    return result
}
