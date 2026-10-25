import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  normalizeUrl,
  getYouTubeThumbnail,
  getYouTubeVideoId,
  isRedditUrl,
  parseRedditUrl,
  cleanRedditTitle,
  getCollectionSlug,
  getCollectionPath,
  findCollectionBySlug,
  slugify,
  extractUrlFromDataTransfer,
  extractBookmarksFromDataTransfer,
  ExtractedBookmark
} from '@keepsake/shared';

const LOCAL_STORAGE_KEY = 'keepsake_local_store_v1';
const AUTH_STORAGE_KEY = 'keepsake_auth_session';
const DEVICE_ID_KEY = 'keepsake_device_id';
const THEME_KEY = 'keepsake_theme_mode';
const CARD_SIZE_KEY = 'keepsake_grid_card_size';
const DRIVE_SYNC_KEY = 'keepsake_drive_sync_enabled';

export type ThemeMode = 'system' | 'light' | 'dark';
export type CardSize = 'small' | 'medium' | 'large';

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
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user?.email && parsed?.tokens?.accessToken) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  // Navigation & Filtering State (initialized from URL pathname if present)
  const [activeCollectionId, setActiveCollectionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        const initialCols: Collection[] = raw ? JSON.parse(raw)?.collections || [] : [];
        const matched = findCollectionBySlug(initialCols, window.location.pathname);
        if (matched) {
          return typeof matched === 'string' ? matched : matched.id;
        }
      } catch {}
    }
    return 'all';
  });

  const selectCollection = useCallback(
    (id: string) => {
      setActiveCollectionId(id);
      setActiveTag(null);

      let targetPath = '/';
      let title = 'Keepsake';

      if (id === 'all') {
        targetPath = '/';
        title = 'Keepsake > All Bookmarks';
      } else if (id === 'unsorted') {
        targetPath = '/unsorted/';
        title = 'Keepsake > Unsorted';
      } else if (id === 'favorites') {
        targetPath = '/favorites/';
        title = 'Keepsake > Favorites';
      } else if (id === 'trash') {
        targetPath = '/trash/';
        title = 'Keepsake > Trash';
      } else {
        const col = store.collections.find((c) => c.id === id);
        if (col) {
          targetPath = getCollectionPath(col);
          title = `Keepsake > ${col.title}`;
        } else {
          targetPath = `/${id}/`;
          title = `Keepsake > ${id}`;
        }
      }

      if (typeof window !== 'undefined') {
        if (window.location.pathname !== targetPath) {
          window.history.pushState({ collectionId: id }, title, targetPath);
        }
        document.title = title;
      }
    },
    [store.collections]
  );
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<BookmarkType | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set());

  // Grid View Card Box Size: small, medium (default/current), large
  const [cardSize, setCardSizeState] = useState<CardSize>(() => {
    const saved = localStorage.getItem(CARD_SIZE_KEY);
    if (saved === 'small' || saved === 'medium' || saved === 'large') {
      return saved as CardSize;
    }
    return 'medium'; // Default is current medium size
  });

  const setCardSize = useCallback((size: CardSize) => {
    setCardSizeState(size);
    localStorage.setItem(CARD_SIZE_KEY, size);
  }, []);

  // Optional Google Drive Sync setting (defaults to false until enabled in Settings)
  const [isDriveSyncEnabled, setIsDriveSyncEnabledState] = useState<boolean>(() => {
    return localStorage.getItem(DRIVE_SYNC_KEY) === 'true';
  });

  const setDriveSyncEnabled = useCallback((enabled: boolean) => {
    setIsDriveSyncEnabledState(enabled);
    localStorage.setItem(DRIVE_SYNC_KEY, String(enabled));
  }, []);

  // Theme: system (default), light, or dark
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved as ThemeMode;
    }
    return 'system'; // Default system driven
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen to system OS theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const effectiveTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : themeMode;

  // Apply Theme to Document and theme-color meta tag
  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeMode);
    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', effectiveTheme === 'dark' ? '#0c0c0e' : '#fafafa');
    }
  }, [themeMode, effectiveTheme]);

  const cycleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  }, []);

  // Sync Status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncedAt: null,
    error: null
  });

  // Sync drive file ID cache
  const [driveFileId, setDriveFileId] = useState<string | null>(null);

  // Stable references for state accessed inside async callbacks to prevent re-creation loops
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const authSessionRef = useRef(authSession);
  useEffect(() => {
    authSessionRef.current = authSession;
  }, [authSession]);

  const driveFileIdRef = useRef<string | null>(driveFileId);
  useEffect(() => {
    driveFileIdRef.current = driveFileId;
  }, [driveFileId]);

  const isSyncingRef = useRef(false);

  // Server Sync Engine (Keepsake Backend Persistence)
  const syncWithServer = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const currentStoreRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const storeToSend = currentStoreRaw ? JSON.parse(currentStoreRaw) : storeRef.current;

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: storeToSend })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.store) {
          setStore((prev) => {
            if (
              data.store.lastModified !== prev.lastModified ||
              data.store.bookmarks.length !== prev.bookmarks.length ||
              data.store.collections.length !== prev.collections.length ||
              JSON.stringify(data.store.bookmarks) !== JSON.stringify(prev.bookmarks) ||
              JSON.stringify(data.store.collections) !== JSON.stringify(prev.collections)
            ) {
              storeRef.current = data.store;
              return data.store;
            }
            return prev;
          });
        }
      }
    } catch (err) {
      if (!options?.silent) {
        console.warn('[Keepsake Web] Server sync offline or unavailable:', err);
      }
    }
  }, []);

  // Initial sync with server on mount
  useEffect(() => {
    syncWithServer({ silent: true });
  }, [syncWithServer]);

  // Sync with server on window focus
  useEffect(() => {
    const handleFocus = () => {
      syncWithServer({ silent: true });
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncWithServer]);

  // Fast periodic sync with server (every 5 seconds) to catch extension/mobile saves instantly
  useEffect(() => {
    const interval = setInterval(() => {
      syncWithServer({ silent: true });
    }, 5000);
    return () => clearInterval(interval);
  }, [syncWithServer]);

  // Listen for sync notifications from extension content script or BroadcastChannel
  useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      if (event.data?.type === 'KEEPSAKE_SYNC_TRIGGER') {
        syncWithServer({ silent: true });
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [syncWithServer]);

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

  const logout = useCallback(() => {
    setAuthSession(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setSyncStatus({ isSyncing: false, lastSyncedAt: null, error: null });
    try {
      (window as any).KeepsakeAndroid?.onLogout();
    } catch {}
  }, []);

  // Synchronize browser URL bar and document title when activeCollectionId changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let targetPath = '/';
    let title = 'Keepsake';

    if (activeCollectionId === 'all') {
      targetPath = '/';
      title = 'Keepsake > All Bookmarks';
    } else if (activeCollectionId === 'unsorted') {
      targetPath = '/unsorted/';
      title = 'Keepsake > Unsorted';
    } else if (activeCollectionId === 'favorites') {
      targetPath = '/favorites/';
      title = 'Keepsake > Favorites';
    } else if (activeCollectionId === 'trash') {
      targetPath = '/trash/';
      title = 'Keepsake > Trash';
    } else {
      const col = store.collections.find((c) => c.id === activeCollectionId);
      if (col) {
        targetPath = getCollectionPath(col);
        title = `Keepsake > ${col.title}`;
      } else {
        targetPath = `/${activeCollectionId}/`;
        title = `Keepsake > ${activeCollectionId}`;
      }
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState({ collectionId: activeCollectionId }, title, targetPath);
    }
    document.title = title;
  }, [activeCollectionId, store.collections]);

  // Handle browser Back / Forward navigation (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const matched = findCollectionBySlug(store.collections, path);
      if (matched) {
        const targetId = typeof matched === 'string' ? matched : matched.id;
        setActiveCollectionId(targetId);
        setActiveTag(null);
      } else if (path === '/' || path === '') {
        setActiveCollectionId('all');
        setActiveTag(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [store.collections]);

  // When store.collections loads or syncs, resolve any initial URL deep link (e.g. /mac-apps/)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    const clean = path.replace(/^\/+|\/+$/g, '');
    if (!clean) return;

    const matched = findCollectionBySlug(store.collections, path);
    if (matched) {
      const targetId = typeof matched === 'string' ? matched : matched.id;
      if (activeCollectionId !== targetId) {
        setActiveCollectionId(targetId);
      }
    }
  }, [store.collections]);

  // Auto-switch viewMode if current collection has a defaultViewMode
  useEffect(() => {
    if (activeCollectionId && activeCollectionId !== 'all' && activeCollectionId !== 'unsorted' && activeCollectionId !== 'trash') {
      const col = store.collections.find((c) => c.id === activeCollectionId);
      if (col?.defaultViewMode) {
        setViewMode(col.defaultViewMode);
      }
    }
  }, [activeCollectionId, store.collections]);

  // Google Drive Sync Engine (Stable callback that does not re-create on store/fileId changes)
  const syncWithGoogleDrive = useCallback(async () => {
    const session = authSessionRef.current;
    if (!session?.tokens?.accessToken) {
      setSyncStatus((prev) => ({ ...prev, isSyncing: false, error: 'Please log in with Google to sync' }));
      return;
    }

    if (isSyncingRef.current) {
      return; // Already in progress, prevent overlapping execution
    }
    isSyncingRef.current = true;

    setSyncStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      let currentAccessToken = session.tokens.accessToken;
      const driveClient = new GoogleDriveClient(currentAccessToken);

      // Check if token expired and attempt refresh
      if (session.tokens.expiresAt && Date.now() > session.tokens.expiresAt - 60000) {
        if (session.tokens.refreshToken) {
          try {
            const refreshRes = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: session.tokens.refreshToken })
            });
            if (refreshRes.ok) {
              const fresh = await refreshRes.json();
              currentAccessToken = fresh.accessToken;
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
          } catch (e) {
            console.warn('[Keepsake Web] Failed to refresh Google OAuth token:', e);
          }
        }
      }

      // 1. Locate file in Google Drive AppData
      const fileMeta = await driveClient.findAppDataStoreFile();
      let remoteStore: KeepsakeDataStore | null = null;
      const existingId = fileMeta?.id || driveFileIdRef.current;

      if (fileMeta) {
        setDriveFileId(fileMeta.id);
        driveFileIdRef.current = fileMeta.id;
        remoteStore = await driveClient.readStore(fileMeta.id);
      }

      // 2. Merge local and remote
      const currentStore = storeRef.current;
      const mergeResult = mergeStores(currentStore, remoteStore, deviceId);

      // 3. Save merged store back to Google Drive
      const updatedFileId = await driveClient.saveStore(mergeResult.mergedStore, existingId);
      setDriveFileId(updatedFileId);
      driveFileIdRef.current = updatedFileId;

      // 4. Update local store if remote changes exist
      if (mergeResult.hasRemoteChanges || JSON.stringify(currentStore) !== JSON.stringify(mergeResult.mergedStore)) {
        setStore(mergeResult.mergedStore);
        storeRef.current = mergeResult.mergedStore;
      }

      const now = new Date().toISOString();
      setSyncStatus({
        isSyncing: false,
        lastSyncedAt: now,
        error: null,
        syncedItemCount: mergeResult.mergedStore.bookmarks.length
      });
    } catch (err: any) {
      console.error('[Keepsake Web] Google Drive sync failed:', err);
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: err.message || 'Google Drive sync failed'
      }));
    } finally {
      isSyncingRef.current = false;
    }
  }, [deviceId]);

  // Auto-sync on startup or when Google Drive sync is enabled (runs only ONCE per enable transition)
  const prevDriveSyncEnabledRef = useRef(false);
  useEffect(() => {
    const hasToken = Boolean(authSession?.tokens?.accessToken);
    if (!hasToken || !isDriveSyncEnabled) {
      prevDriveSyncEnabledRef.current = false;
      return;
    }

    // Trigger only once when transitioning to enabled or upon initial load
    if (!prevDriveSyncEnabledRef.current) {
      prevDriveSyncEnabledRef.current = true;
      const timer = setTimeout(() => {
        syncWithGoogleDrive();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [Boolean(authSession?.tokens?.accessToken), isDriveSyncEnabled, syncWithGoogleDrive]);

  // Periodic background sync every 3 minutes if Google Drive sync is enabled
  useEffect(() => {
    const hasToken = Boolean(authSession?.tokens?.accessToken);
    if (!hasToken || !isDriveSyncEnabled) return;
    const interval = setInterval(() => {
      syncWithGoogleDrive();
    }, 180000);
    return () => clearInterval(interval);
  }, [Boolean(authSession?.tokens?.accessToken), isDriveSyncEnabled, syncWithGoogleDrive]);

  // Bookmark Actions
  const addBookmark = useCallback(
    (bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'domain' | 'type'> & { type?: BookmarkType }) => {
      const now = new Date().toISOString();
      const domain = extractDomain(bookmarkData.url);
      const ytThumb = getYouTubeThumbnail(bookmarkData.url);
      const isVideo = !!getYouTubeVideoId(bookmarkData.url);

      let cover = bookmarkData.cover;
      if (ytThumb && (!cover || cover.includes('yt_1200.png') || cover.includes('youtube.com/img/desktop'))) {
        cover = ytThumb;
      }

      let title = bookmarkData.title;
      let tags = bookmarkData.tags || [];
      let favicon = bookmarkData.favicon || getFaviconUrl(domain);

      if (isRedditUrl(bookmarkData.url)) {
        title = cleanRedditTitle(title) || title;
        const rInfo = parseRedditUrl(bookmarkData.url);
        if (rInfo?.subreddit && tags.length === 0) {
          tags = [rInfo.subreddit.toLowerCase()];
        }
        if (!bookmarkData.favicon || bookmarkData.favicon.includes('google.com')) {
          favicon = 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png';
        }
      }

      const newBm: Bookmark = {
        ...bookmarkData,
        id: 'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        title,
        domain,
        favicon,
        cover,
        tags,
        type: isVideo ? 'video' : (bookmarkData.type || 'link'),
        createdAt: now,
        updatedAt: now
      };

      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: [newBm, ...prev.bookmarks]
      }));

      // Persist to server
      fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBm)
      }).catch((e) => console.warn('[Keepsake Web] addBookmark server persist error:', e));

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

    // Persist to server
    fetch(`/api/bookmarks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }).catch((e) => console.warn('[Keepsake Web] updateBookmark server persist error:', e));
  }, []);

  const saveBookmarksToCollection = useCallback(
    async (
      items: Array<{ url: string; title?: string }>,
      targetCollectionId?: string
    ): Promise<Bookmark[]> => {
      if (!items || items.length === 0) return [];

      let colId = targetCollectionId || 'unsorted';
      let isFavorite = false;
      if (colId === 'all' || colId === 'trash') {
        colId = 'unsorted';
      } else if (colId === 'favorites') {
        colId = 'unsorted';
        isFavorite = true;
      }

      const now = new Date().toISOString();
      const newBookmarks: Bookmark[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const cleanUrl = normalizeUrl(item.url);
        const domain = extractDomain(cleanUrl);
        const ytThumb = getYouTubeThumbnail(cleanUrl);
        const isVideo = !!getYouTubeVideoId(cleanUrl);
        let cover = ytThumb || undefined;
        let favicon = getFaviconUrl(domain);
        let title = item.title || domain;
        let tags: string[] = [];

        if (isRedditUrl(cleanUrl)) {
          title = cleanRedditTitle(title) || title;
          const rInfo = parseRedditUrl(cleanUrl);
          if (rInfo?.subreddit) tags = [rInfo.subreddit.toLowerCase()];
          favicon = 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png';
        }

        const newBm: Bookmark = {
          id: 'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36) + i.toString(36),
          url: cleanUrl,
          title,
          description: '',
          domain,
          collectionId: colId,
          tags,
          isFavorite,
          isTrash: false,
          type: isVideo ? 'video' : 'link',
          favicon,
          cover,
          createdAt: now,
          updatedAt: now
        };
        newBookmarks.push(newBm);
      }

      // Add all to store in one atomic update
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: [...newBookmarks, ...prev.bookmarks]
      }));

      // Persist to server
      for (const bm of newBookmarks) {
        fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bm)
        }).catch((e) => console.warn('[Keepsake Web] addBookmark server persist error:', e));
      }

      // Background scrape metadata for dropped items
      (async () => {
        const toScrape = newBookmarks.slice(0, 20);
        for (const bm of toScrape) {
          try {
            const res = await fetch(`/api/scrape?url=${encodeURIComponent(bm.url)}`);
            if (res.ok) {
              const meta = await res.json();
              updateBookmark(bm.id, {
                title: meta.title || bm.title,
                description: meta.description || bm.description,
                cover: meta.cover || bm.cover,
                favicon: meta.favicon || bm.favicon,
                type: meta.type || bm.type,
                readerContent: meta.readerContent
              });
            }
          } catch (err) {
            console.warn('[Keepsake Web] Auto-scrape on drop failed:', err);
          }
        }
      })();

      return newBookmarks;
    },
    [updateBookmark]
  );

  const saveUrlToCollection = useCallback(
    async (rawUrl: string, targetCollectionId?: string, initialTitle?: string): Promise<Bookmark> => {
      const res = await saveBookmarksToCollection([{ url: rawUrl, title: initialTitle }], targetCollectionId);
      return res[0];
    },
    [saveBookmarksToCollection]
  );

  const toggleFavorite = useCallback((id: string) => {
    const now = new Date().toISOString();
    let nextFavorite = false;
    setStore((prev) => {
      const bm = prev.bookmarks.find((b) => b.id === id);
      nextFavorite = bm ? !bm.isFavorite : false;
      return {
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((b) =>
          b.id === id ? { ...b, isFavorite: nextFavorite, updatedAt: now } : b
        )
      };
    });

    fetch(`/api/bookmarks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: nextFavorite })
    }).catch((e) => console.warn('[Keepsake Web] toggleFavorite server persist error:', e));
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

    fetch(`/api/bookmarks/${id}`, {
      method: 'DELETE'
    }).catch((e) => console.warn('[Keepsake Web] moveToTrash server persist error:', e));
  }, []);

  const restoreFromTrash = useCallback((id: string) => {
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((bm) => (bm.id === id ? { ...bm, isTrash: false, updatedAt: now } : bm))
    }));

    fetch(`/api/bookmarks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTrash: false })
    }).catch((e) => console.warn('[Keepsake Web] restoreFromTrash server persist error:', e));
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

    fetch(`/api/bookmarks/${id}?permanent=true`, {
      method: 'DELETE'
    }).catch((e) => console.warn('[Keepsake Web] permanentlyDelete server persist error:', e));
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
      const nextStore = {
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.filter((bm) => !bm.isTrash),
        tombstones: [...(prev.tombstones || []), ...newTombstones]
      };
      // Full sync to server
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: nextStore })
      }).catch(() => {});
      return nextStore;
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

  const moveBookmarkToCollection = useCallback(
    (bookmarkId: string, targetCollectionId: string) => {
      const ids = selectedBookmarkIds.has(bookmarkId)
        ? Array.from(selectedBookmarkIds)
        : [bookmarkId];

      const now = new Date().toISOString();

      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) => {
          if (!ids.includes(bm.id)) return bm;
          if (targetCollectionId === 'trash') {
            return { ...bm, isTrash: true, updatedAt: now };
          }
          if (targetCollectionId === 'favorites') {
            return { ...bm, isFavorite: true, updatedAt: now };
          }
          return { ...bm, collectionId: targetCollectionId, isTrash: false, updatedAt: now };
        })
      }));

      ids.forEach((id) => {
        const updates =
          targetCollectionId === 'trash'
            ? { isTrash: true }
            : targetCollectionId === 'favorites'
            ? { isFavorite: true }
            : { collectionId: targetCollectionId, isTrash: false };

        fetch(`/api/bookmarks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        }).catch((e) => console.warn('[Keepsake Web] moveBookmarkToCollection persist error:', e));
      });
    },
    [selectedBookmarkIds]
  );

  const addTagToBookmark = useCallback(
    (bookmarkId: string, tagName: string) => {
      if (!tagName.trim()) return;
      const cleanTag = tagName.trim().toLowerCase();
      const ids = selectedBookmarkIds.has(bookmarkId)
        ? Array.from(selectedBookmarkIds)
        : [bookmarkId];

      const now = new Date().toISOString();

      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) => {
          if (ids.includes(bm.id) && !bm.tags.includes(cleanTag)) {
            const nextTags = [...bm.tags, cleanTag];
            fetch(`/api/bookmarks/${bm.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tags: nextTags })
            }).catch((e) => console.warn('[Keepsake Web] addTagToBookmark persist error:', e));
            return { ...bm, tags: nextTags, updatedAt: now };
          }
          return bm;
        })
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

      fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCol)
      }).catch((e) => console.warn('[Keepsake Web] addCollection server persist error:', e));

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

    fetch(`/api/collections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }).catch((e) => console.warn('[Keepsake Web] updateCollection server persist error:', e));
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

      fetch(`/api/collections/${id}`, {
        method: 'DELETE'
      }).catch((e) => console.warn('[Keepsake Web] deleteCollection server persist error:', e));

      if (activeCollectionId === id) {
        setActiveCollectionId('all');
      }
    },
    [activeCollectionId]
  );

  const reorderCollections = useCallback(
    (newOrder: Collection[]) => {
      const now = new Date().toISOString();
      const systemCols = store.collections.filter((c) => c.isSystem || c.id === 'unsorted');
      const customCols = newOrder.filter((c) => !c.isSystem && c.id !== 'unsorted');

      const updatedCustomCols = customCols.map((col, index) => ({
        ...col,
        sortOrder: index + 1,
        updatedAt: now
      }));

      const finalCollections = [...systemCols, ...updatedCustomCols];

      setStore((prev) => ({
        ...prev,
        lastModified: now,
        collections: finalCollections
      }));

      fetch('/api/collections/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionIds: updatedCustomCols.map((c) => c.id)
        })
      }).catch((e) => console.warn('[Keepsake Web] reorderCollections server persist error:', e));
    },
    [store.collections]
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
    setActiveCollectionId: selectCollection,
    selectCollection,
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
    theme: effectiveTheme,
    themeMode,
    effectiveTheme,
    setThemeMode,
    cycleThemeMode,
    cardSize,
    setCardSize,
    authSession,
    setAuthSession,
    logout,
    isDriveSyncEnabled,
    setDriveSyncEnabled,
    syncStatus,
    syncWithGoogleDrive,
    syncWithServer,
    addBookmark,
    saveUrlToCollection,
    saveBookmarksToCollection,
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
    moveBookmarkToCollection,
    addTagToBookmark,
    addCollection,
    updateCollection,
    deleteCollection,
    reorderCollections,
    importData
  };
}
