import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bookmark,
  Collection,
  SyncTombstone,
  KeepsakeDataStore,
  AuthSession,
  SyncStatus,
  ViewMode,
  SortField,
  SortOrder,
  BookmarkType,
  createDefaultStore,
  mergeStores,
  GoogleDriveClient,
  matchesSearch,
  parseSearchQuery,
  exportToNetscapeHtml,
  parseNetscapeHtml,
  extractDomain,
  getFaviconUrl,
  normalizeUrl
} from '@keepsake/shared';

const LOCAL_STORAGE_KEY = 'keepsake_local_store_v1';
const AUTH_STORAGE_KEY = 'keepsake_auth_session';
const DEVICE_ID_KEY = 'keepsake_device_id';
const THEME_KEY = 'keepsake_theme';

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function useKeepsakeStore() {
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  // Initialize Store from LocalStorage
  const [store, setStore] = useState<KeepsakeDataStore>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to load local store:', e);
    }
    return createDefaultStore(deviceId);
  });

  // Auth Session
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });

  // Navigation & Filtering State
  const [activeCollectionId, setActiveCollectionId] = useState<string>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<BookmarkType | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set());

  // Theme
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Sync Status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncedAt: null,
    error: null
  });

  // Sync drive file ID cache
  const [driveFileId, setDriveFileId] = useState<string | null>(null);

  // Apply Theme to Document
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Persist store to LocalStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, [store]);

  // Persist Auth Session
  useEffect(() => {
    if (authSession) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [authSession]);

  // Auto-switch viewMode if current collection has a defaultViewMode
  useEffect(() => {
    if (activeCollectionId && activeCollectionId !== 'all' && activeCollectionId !== 'unsorted' && activeCollectionId !== 'trash') {
      const col = store.collections.find((c) => c.id === activeCollectionId);
      if (col?.defaultViewMode) {
        setViewMode(col.defaultViewMode);
      }
    }
  }, [activeCollectionId, store.collections]);

  // Google Drive Sync Engine
  const syncWithGoogleDrive = useCallback(async () => {
    if (!authSession?.tokens?.accessToken) {
      setSyncStatus((prev) => ({ ...prev, error: 'Please log in with Google to sync' }));
      return;
    }

    setSyncStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      const driveClient = new GoogleDriveClient(authSession.tokens.accessToken);

      // Check if token expired
      if (authSession.tokens.expiresAt && Date.now() > authSession.tokens.expiresAt - 60000) {
        if (authSession.tokens.refreshToken) {
          try {
            const refreshRes = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: authSession.tokens.refreshToken })
            });
            if (refreshRes.ok) {
              const fresh = await refreshRes.json();
              setAuthSession((prev) =>
                prev
                  ? {
                      ...prev,
                      tokens: {
                        ...prev.tokens,
                        accessToken: fresh.accessToken,
                        expiresAt: fresh.expiresAt
                      }
                    }
                  : null
              );
              driveClient.setAccessToken(fresh.accessToken);
            }
          } catch {}
        }
      }

      // 1. Locate file in Google Drive AppData
      let fileMeta = await driveClient.findAppDataStoreFile();
      let remoteStore: KeepsakeDataStore | null = null;
      let existingId = fileMeta?.id || driveFileId;

      if (fileMeta) {
        setDriveFileId(fileMeta.id);
        remoteStore = await driveClient.readStore(fileMeta.id);
      }

      // 2. Merge local and remote
      const mergeResult = mergeStores(store, remoteStore, deviceId);

      // 3. Save merged store back to Google Drive
      const updatedFileId = await driveClient.saveStore(mergeResult.mergedStore, existingId);
      setDriveFileId(updatedFileId);

      // 4. Update local store
      setStore(mergeResult.mergedStore);

      const now = new Date().toISOString();
      setSyncStatus({
        isSyncing: false,
        lastSyncedAt: now,
        error: null,
        syncedItemCount: mergeResult.mergedStore.bookmarks.length
      });
    } catch (err: any) {
      console.error('Sync failed:', err);
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: err.message || 'Google Drive sync failed'
      }));
    }
  }, [authSession, store, deviceId, driveFileId]);

  // Auto-sync on startup if logged in
  useEffect(() => {
    if (authSession?.tokens?.accessToken) {
      const timer = setTimeout(() => {
        syncWithGoogleDrive();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [authSession?.tokens?.accessToken]);

  // Periodic background sync every 3 minutes
  useEffect(() => {
    if (!authSession?.tokens?.accessToken) return;
    const interval = setInterval(() => {
      syncWithGoogleDrive();
    }, 180000);
    return () => clearInterval(interval);
  }, [authSession?.tokens?.accessToken, syncWithGoogleDrive]);

  // Bookmark Actions
  const addBookmark = useCallback(
    (bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'domain' | 'type'> & { type?: BookmarkType }) => {
      const now = new Date().toISOString();
      const domain = extractDomain(bookmarkData.url);
      const newBm: Bookmark = {
        ...bookmarkData,
        id: 'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        domain,
        favicon: bookmarkData.favicon || getFaviconUrl(domain),
        type: bookmarkData.type || 'link',
        createdAt: now,
        updatedAt: now
      };

      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: [newBm, ...prev.bookmarks]
      }));

      return newBm;
    },
    []
  );

  const updateBookmark = useCallback((id: string, updates: Partial<Bookmark>) => {
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((bm) => (bm.id === id ? { ...bm, ...updates, updatedAt: now } : bm))
    }));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((bm) =>
        bm.id === id ? { ...bm, isFavorite: !bm.isFavorite, updatedAt: now } : bm
      )
    }));
  }, []);

  const moveToTrash = useCallback((id: string) => {
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((bm) => (bm.id === id ? { ...bm, isTrash: true, updatedAt: now } : bm))
    }));
    setSelectedBookmarkIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const restoreFromTrash = useCallback((id: string) => {
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((bm) => (bm.id === id ? { ...bm, isTrash: false, updatedAt: now } : bm))
    }));
  }, []);

  const permanentlyDeleteBookmark = useCallback((id: string) => {
    const now = new Date().toISOString();
    const tombstone: SyncTombstone = { id, type: 'bookmark', deletedAt: now };
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.filter((bm) => bm.id !== id),
      tombstones: [...(prev.tombstones || []), tombstone]
    }));
    setSelectedBookmarkIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const emptyTrash = useCallback(() => {
    const now = new Date().toISOString();
    setStore((prev) => {
      const trashed = prev.bookmarks.filter((bm) => bm.isTrash);
      const newTombstones: SyncTombstone[] = trashed.map((bm) => ({
        id: bm.id,
        type: 'bookmark',
        deletedAt: now
      }));
      return {
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.filter((bm) => !bm.isTrash),
        tombstones: [...(prev.tombstones || []), ...newTombstones]
      };
    });
  }, []);

  // Bulk Actions
  const bulkDelete = useCallback(() => {
    const ids = Array.from(selectedBookmarkIds);
    if (activeCollectionId === 'trash') {
      const now = new Date().toISOString();
      const tombstones: SyncTombstone[] = ids.map((id) => ({ id, type: 'bookmark', deletedAt: now }));
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.filter((bm) => !ids.includes(bm.id)),
        tombstones: [...(prev.tombstones || []), ...tombstones]
      }));
    } else {
      const now = new Date().toISOString();
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) => (ids.includes(bm.id) ? { ...bm, isTrash: true, updatedAt: now } : bm))
      }));
    }
    setSelectedBookmarkIds(new Set());
  }, [selectedBookmarkIds, activeCollectionId]);

  const bulkMove = useCallback(
    (collectionId: string) => {
      const ids = Array.from(selectedBookmarkIds);
      const now = new Date().toISOString();
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) =>
          ids.includes(bm.id) ? { ...bm, collectionId, isTrash: false, updatedAt: now } : bm
        )
      }));
      setSelectedBookmarkIds(new Set());
    },
    [selectedBookmarkIds]
  );

  const bulkAddTag = useCallback(
    (tag: string) => {
      if (!tag.trim()) return;
      const cleanTag = tag.trim().toLowerCase();
      const ids = Array.from(selectedBookmarkIds);
      const now = new Date().toISOString();
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) => {
          if (ids.includes(bm.id) && !bm.tags.includes(cleanTag)) {
            return { ...bm, tags: [...bm.tags, cleanTag], updatedAt: now };
          }
          return bm;
        })
      }));
    },
    [selectedBookmarkIds]
  );

  const bulkFavorite = useCallback(
    (isFavorite: boolean) => {
      const ids = Array.from(selectedBookmarkIds);
      const now = new Date().toISOString();
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) =>
          ids.includes(bm.id) ? { ...bm, isFavorite, updatedAt: now } : bm
        )
      }));
    },
    [selectedBookmarkIds]
  );

  // Collection Actions
  const addCollection = useCallback(
    (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => {
      const now = new Date().toISOString();
      const newCol: Collection = {
        ...data,
        id: 'col_' + Math.random().toString(36).substring(2, 9),
        sortOrder: store.collections.length,
        createdAt: now,
        updatedAt: now
      };
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        collections: [...prev.collections, newCol]
      }));
      return newCol;
    },
    [store.collections.length]
  );

  const updateCollection = useCallback((id: string, updates: Partial<Collection>) => {
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      collections: prev.collections.map((col) => (col.id === id ? { ...col, ...updates, updatedAt: now } : col))
    }));
  }, []);

  const deleteCollection = useCallback(
    (id: string) => {
      if (id === 'unsorted') return; // Cannot delete unsorted
      const now = new Date().toISOString();
      const tombstone: SyncTombstone = { id, type: 'collection', deletedAt: now };

      setStore((prev) => ({
        ...prev,
        lastModified: now,
        // Move bookmarks from this collection to unsorted
        bookmarks: prev.bookmarks.map((bm) =>
          bm.collectionId === id ? { ...bm, collectionId: 'unsorted', updatedAt: now } : bm
        ),
        collections: prev.collections.filter((col) => col.id !== id),
        tombstones: [...(prev.tombstones || []), tombstone]
      }));

      if (activeCollectionId === id) {
        setActiveCollectionId('all');
      }
    },
    [activeCollectionId]
  );

  // Derived: All unique tags with counts
  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    for (const bm of store.bookmarks) {
      if (bm.isTrash) continue;
      for (const tag of bm.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [store.bookmarks]);

  // Filtered and Sorted Bookmarks for current active view
  const filteredBookmarks = useMemo(() => {
    const parsedSearch = parseSearchQuery(searchQuery);

    return store.bookmarks
      .filter((bm) => {
        // Trash view
        if (activeCollectionId === 'trash') {
          return bm.isTrash;
        }
        if (bm.isTrash) return false;

        // Active collection filter
        if (activeCollectionId === 'favorites') {
          if (!bm.isFavorite) return false;
        } else if (activeCollectionId === 'unsorted') {
          if (bm.collectionId !== 'unsorted') return false;
        } else if (activeCollectionId !== 'all') {
          if (bm.collectionId !== activeCollectionId) return false;
        }

        // Active tag filter
        if (activeTag && !bm.tags.includes(activeTag)) {
          return false;
        }

        // Selected type filter
        if (selectedType !== 'all' && bm.type !== selectedType) {
          return false;
        }

        // Search criteria
        if (searchQuery.trim() && !matchesSearch(bm, parsedSearch)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'createdAt') {
          cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        } else if (sortField === 'updatedAt') {
          cmp = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        } else if (sortField === 'title') {
          cmp = (a.title || '').localeCompare(b.title || '');
        } else if (sortField === 'domain') {
          cmp = (a.domain || '').localeCompare(b.domain || '');
        }
        return sortOrder === 'desc' ? cmp : -cmp;
      });
  }, [
    store.bookmarks,
    activeCollectionId,
    activeTag,
    selectedType,
    searchQuery,
    sortField,
    sortOrder
  ]);

  // Count Badges for System Collections
  const counts = useMemo(() => {
    let allCount = 0;
    let unsortedCount = 0;
    let favoritesCount = 0;
    let trashCount = 0;

    for (const bm of store.bookmarks) {
      if (bm.isTrash) {
        trashCount++;
      } else {
        allCount++;
        if (bm.collectionId === 'unsorted') unsortedCount++;
        if (bm.isFavorite) favoritesCount++;
      }
    }

    return { allCount, unsortedCount, favoritesCount, trashCount };
  }, [store.bookmarks]);

  // Import Netscape HTML / JSON
  const importData = useCallback(
    (content: string, format: 'html' | 'json') => {
      const now = new Date().toISOString();
      if (format === 'json') {
        const parsed = JSON.parse(content);
        if (parsed.bookmarks) {
          const mergeResult = mergeStores(store, parsed, deviceId);
          setStore(mergeResult.mergedStore);
          return { importedCount: parsed.bookmarks.length };
        }
      } else {
        const parsedItems = parseNetscapeHtml(content);
        const colMap = new Map<string, Collection>();
        store.collections.forEach((c) => colMap.set(c.title.toLowerCase(), c));

        const newBookmarks: Bookmark[] = [];
        const newCols: Collection[] = [];

        for (const item of parsedItems) {
          const colName = item.collectionName || 'Unsorted';
          const lowerName = colName.toLowerCase();
          let targetColId = 'unsorted';

          if (colName !== 'Unsorted') {
            if (colMap.has(lowerName)) {
              targetColId = colMap.get(lowerName)!.id;
            } else {
              const newCol: Collection = {
                id: 'col_' + Math.random().toString(36).substring(2, 9),
                title: colName,
                sortOrder: store.collections.length + newCols.length,
                createdAt: now,
                updatedAt: now
              };
              colMap.set(lowerName, newCol);
              newCols.push(newCol);
              targetColId = newCol.id;
            }
          }

          const domain = extractDomain(item.url);
          newBookmarks.push({
            id: 'bm_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
            url: item.url,
            title: item.title || domain,
            description: item.description || '',
            domain,
            favicon: getFaviconUrl(domain),
            collectionId: targetColId,
            tags: item.tags || [],
            isFavorite: false,
            isTrash: false,
            type: 'link',
            createdAt: item.createdAt || now,
            updatedAt: item.createdAt || now
          });
        }

        setStore((prev) => ({
          ...prev,
          lastModified: now,
          collections: [...prev.collections, ...newCols],
          bookmarks: [...newBookmarks, ...prev.bookmarks]
        }));

        return { importedCount: newBookmarks.length };
      }
      return { importedCount: 0 };
    },
    [store, deviceId]
  );

  return {
    store,
    bookmarks: filteredBookmarks,
    collections: store.collections,
    allTags,
    counts,
    activeCollectionId,
    setActiveCollectionId,
    activeTag,
    setActiveTag,
    searchQuery,
    setSearchQuery,
    selectedType,
    setSelectedType,
    viewMode,
    setViewMode,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    selectedBookmarkIds,
    setSelectedBookmarkIds,
    theme,
    setTheme,
    authSession,
    setAuthSession,
    syncStatus,
    syncWithGoogleDrive,
    addBookmark,
    updateBookmark,
    toggleFavorite,
    moveToTrash,
    restoreFromTrash,
    permanentlyDeleteBookmark,
    emptyTrash,
    bulkDelete,
    bulkMove,
    bulkAddTag,
    bulkFavorite,
    addCollection,
    updateCollection,
    deleteCollection,
    importData
  };
}
