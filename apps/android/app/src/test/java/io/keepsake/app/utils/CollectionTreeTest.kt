package io.keepsake.app.utils

import io.keepsake.app.models.Collection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CollectionTreeTest {
    @Test fun parentPrecedesChildrenDespiteSortOrder() {
        val collections = listOf(
            Collection(id = "child", title = "Child", parentId = "root", sortOrder = 0),
            Collection(id = "root", title = "Root", sortOrder = 1),
            Collection(id = "grandchild", title = "Grandchild", parentId = "child", sortOrder = 2)
        )
        assertEquals(listOf("Root", "— Child", "— — Grandchild"), flattenCollections(collections).map { it.label })
    }

    @Test fun orphanedAndCyclicCollectionsRemainVisible() {
        val collections = listOf(
            Collection(id = "orphan", title = "Orphan", parentId = "missing"),
            Collection(id = "a", title = "A", parentId = "b"),
            Collection(id = "b", title = "B", parentId = "a")
        )
        assertEquals(setOf("orphan", "a", "b"), flattenCollections(collections).map { it.collection.id }.toSet())
    }

    @Test fun parentSelectionRejectsCyclesAndMissingParents() {
        val collections = listOf(Collection(id = "root", title = "Root"), Collection(id = "child", title = "Child", parentId = "root"))
        assertFalse(canSetCollectionParent(collections, "root", "child"))
        assertFalse(canSetCollectionParent(collections, "child", "missing"))
        assertTrue(canSetCollectionParent(collections, "child", "root"))
        assertTrue(canSetCollectionParent(collections, "child", null))
    }
}
