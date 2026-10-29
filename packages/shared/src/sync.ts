import { KeepsakeDataStore, Bookmark, Collection, SyncTombstone } from './types.js';

export interface MergeResult {
  mergedStore: KeepsakeDataStore;
  hasLocalChanges: boolean;
  hasRemoteChanges: boolean;
  bookmarksUpdated: number;
  collectionsUpdated: number;
}

/**
 * Merges a local data store with a remote data store using Last-Write-Wins (LWW)
 * and tombstone propagation for safe deletions.
 */
export function mergeStores(
  local: KeepsakeDataStore,
  remote: KeepsakeDataStore | null,
  currentDeviceId: string
): MergeResult {
  if (!remote) {
    return {
      mergedStore: {
        ...local,
        lastModified: new Date().toISOString(),
        deviceId: currentDeviceId
      },
      hasLocalChanges: true,
      hasRemoteChanges: false,
      bookmarksUpdated: 0,
      collectionsUpdated: 0
    };
  }

  let bookmarksUpdated = 0;
  let collectionsUpdated = 0;
  let hasLocalChanges = false;
  let hasRemoteChanges = false;

  // 1. Merge Tombstones
  const tombstoneMap = new Map<string, SyncTombstone>();
  for (const t of [...(local.tombstones || []), ...(remote.tombstones || [])]) {
    const existing = tombstoneMap.get(t.id);
    if (!existing || new Date(t.deletedAt).getTime() > new Date(existing.deletedAt).getTime()) {
      tombstoneMap.set(t.id, t);
    }
  }

  // 2. Merge Collections
  const mergedCollectionsMap = new Map<string, Collection>();
  const localCollections = new Map(local.collections.map((c) => [c.id, c]));
  const remoteCollections = new Map(remote.collections.map((c) => [c.id, c]));
  const allCollectionIds = new Set([
    ...local.collections.map((c) => c.id),
    ...remote.collections.map((c) => c.id)
  ]);

  for (const id of allCollectionIds) {
    const localCol = localCollections.get(id);
    const remoteCol = remoteCollections.get(id);
    const tombstone = tombstoneMap.get(id);

    // If tombstoned after the latest update, discard
    const latestColUpdate = Math.max(
      localCol ? new Date(localCol.updatedAt).getTime() : 0,
      remoteCol ? new Date(remoteCol.updatedAt).getTime() : 0
    );

    if (tombstone && new Date(tombstone.deletedAt).getTime() >= latestColUpdate) {
      if (localCol) hasLocalChanges = true;
      continue;
    }

    if (localCol && !remoteCol) {
      mergedCollectionsMap.set(id, localCol);
      hasRemoteChanges = true;
    } else if (!localCol && remoteCol) {
      mergedCollectionsMap.set(id, remoteCol);
      hasLocalChanges = true;
      collectionsUpdated++;
    } else if (localCol && remoteCol) {
      const localTime = new Date(localCol.updatedAt).getTime();
      const remoteTime = new Date(remoteCol.updatedAt).getTime();
      if (remoteTime > localTime) {
        mergedCollectionsMap.set(id, remoteCol);
        hasLocalChanges = true;
        collectionsUpdated++;
      } else {
        mergedCollectionsMap.set(id, localCol);
        if (localTime > remoteTime) {
          hasRemoteChanges = true;
        }
      }
    }
  }

  // 3. Merge Bookmarks
  const mergedBookmarksMap = new Map<string, Bookmark>();
  const localBookmarks = new Map(local.bookmarks.map((b) => [b.id, b]));
  const remoteBookmarks = new Map(remote.bookmarks.map((b) => [b.id, b]));
  const allBookmarkIds = new Set([
    ...local.bookmarks.map((b) => b.id),
    ...remote.bookmarks.map((b) => b.id)
  ]);

  for (const id of allBookmarkIds) {
    const localBm = localBookmarks.get(id);
    const remoteBm = remoteBookmarks.get(id);
    const tombstone = tombstoneMap.get(id);

    const latestBmUpdate = Math.max(
      localBm ? new Date(localBm.updatedAt).getTime() : 0,
      remoteBm ? new Date(remoteBm.updatedAt).getTime() : 0
    );

    if (tombstone && new Date(tombstone.deletedAt).getTime() >= latestBmUpdate) {
      if (localBm) hasLocalChanges = true;
      continue;
    }

    if (localBm && !remoteBm) {
      mergedBookmarksMap.set(id, localBm);
      hasRemoteChanges = true;
    } else if (!localBm && remoteBm) {
      mergedBookmarksMap.set(id, remoteBm);
      hasLocalChanges = true;
      bookmarksUpdated++;
    } else if (localBm && remoteBm) {
      const localTime = new Date(localBm.updatedAt).getTime();
      const remoteTime = new Date(remoteBm.updatedAt).getTime();
      if (remoteTime > localTime) {
        mergedBookmarksMap.set(id, remoteBm);
        hasLocalChanges = true;
        bookmarksUpdated++;
      } else {
        mergedBookmarksMap.set(id, localBm);
        if (localTime > remoteTime) {
          hasRemoteChanges = true;
        }
      }
    }
  }

  // Retain deletions so a device returning after a long absence cannot resurrect them.
  const prunedTombstones = Array.from(tombstoneMap.values());
  const searches = new Map<string, NonNullable<KeepsakeDataStore['savedSearches']>[number]>();
  for (const item of [...(local.savedSearches || []), ...(remote.savedSearches || [])]) {
    const existing = searches.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt || (item.updatedAt === existing.updatedAt && JSON.stringify(item) > JSON.stringify(existing))) searches.set(item.id, item);
  }

  const mergedStore: KeepsakeDataStore = {
    version: 1,
    schemaVersion: 1,
    lastModified: new Date().toISOString(),
    deviceId: currentDeviceId,
    collections: Array.from(mergedCollectionsMap.values()).sort((a, b) => a.sortOrder - b.sortOrder),
    bookmarks: Array.from(mergedBookmarksMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    tombstones: prunedTombstones,
    savedSearches: Array.from(searches.values()).sort((a, b) => a.id.localeCompare(b.id))
  };

  return {
    mergedStore,
    hasLocalChanges,
    hasRemoteChanges,
    bookmarksUpdated,
    collectionsUpdated
  };
}

/**
 * Creates an empty default Keepsake store
 */
export function createDefaultStore(deviceId: string): KeepsakeDataStore {
  const now = new Date().toISOString();
  return {
    version: 1,
    schemaVersion: 1,
    lastModified: now,
    deviceId,
    collections: [
      {
        id: 'unsorted',
        title: 'Unsorted',
        description: 'Inbox for newly saved bookmarks',
        icon: 'Inbox',
        color: '#6b7280',
        isSystem: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now
      }
    ],
    bookmarks: [],
    tombstones: [],
    savedSearches: []
  };
}
