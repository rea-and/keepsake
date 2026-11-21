import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
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
  parseBackup,
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
  isSparseTitle,
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
export type StatusFilter = 'all' | 'pending' | 'done';

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Cheap summary of a library that changes whenever the user edits it (every edit stamps updatedAt). */
function libraryFingerprint(store: KeepsakeDataStore): string {
  const newest = (items: { updatedAt: string }[]) => items.reduce((max, item) => (item.updatedAt > max ? item.updatedAt : max), '');
  const searches = store.savedSearches || [];
  return [store.bookmarks.length, newest(store.bookmarks), store.collections.length, newest(store.collections), (store.tombstones || []).length, searches.length, newest(searches)].join('|');
}

export function useKeepsakeStore() {
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  // Initialize Store from LocalStorage
  const [store, setStore] = useState<KeepsakeDataStore>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed: KeepsakeDataStore = JSON.parse(raw);
        if (!parsed.savedSearches) {
          let legacy: any = [];
          try { legacy = JSON.parse(localStorage.getItem('keepsake_saved_searches') || '[]'); } catch {}
          parsed.savedSearches = Array.isArray(legacy) ? legacy.filter((item) => typeof item?.name === 'string' && typeof item?.query === 'string').map((item, index) => ({ id: `search_${deviceId}_${index}`, name: item.name, query: item.query, updatedAt: new Date().toISOString() })) : [];
        }
        return parsed;
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
        if (parsed?.user?.email && parsed?.tokens?.accessToken && parsed?.apiToken) {
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<BookmarkType | 'all'>('all');
  type ViewPreferences = { viewMode?: ViewMode; sortField?: SortField; sortOrder?: SortOrder };
  const [collectionPreferences, setCollectionPreferences] = useState<Record<string, ViewPreferences>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('keepsake_collection_preferences') || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  });
  const legacyView = localStorage.getItem('keepsake_view');
  const legacySort = localStorage.getItem('keepsake_sort_field');
  const prefs = collectionPreferences[activeCollectionId] || {};
  const defaultView = store.collections.find((col) => col.id === activeCollectionId)?.defaultViewMode;
  const viewMode: ViewMode = ['cards', 'list', 'headlines', 'moodboard'].includes(prefs.viewMode || '') ? prefs.viewMode! : (defaultView || (legacyView === 'list' || legacyView === 'headlines' || legacyView === 'moodboard' ? legacyView : 'cards'));
  const sortField: SortField = ['createdAt', 'updatedAt', 'title', 'domain'].includes(prefs.sortField || '') ? prefs.sortField! : (legacySort === 'updatedAt' || legacySort === 'title' || legacySort === 'domain' ? legacySort : 'createdAt');
  const sortOrder: SortOrder = prefs.sortOrder === 'asc' || prefs.sortOrder === 'desc' ? prefs.sortOrder : (localStorage.getItem('keepsake_sort_order') === 'asc' ? 'asc' : 'desc');
  const setPreference = useCallback((updates: ViewPreferences) => {
    setCollectionPreferences((prev) => ({ ...prev, [activeCollectionId]: { ...prev[activeCollectionId], ...updates } }));
  }, [activeCollectionId]);
  const setViewMode = useCallback((value: ViewMode) => setPreference({ viewMode: value }), [setPreference]);
  const setSortField = useCallback((value: SortField) => setPreference({ sortField: value }), [setPreference]);
  const setSortOrder = useCallback((value: SortOrder) => setPreference({ sortOrder: value }), [setPreference]);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set());
  useEffect(() => { localStorage.setItem('keepsake_collection_preferences', JSON.stringify(collectionPreferences)); }, [collectionPreferences]);
  useEffect(() => { setSelectedBookmarkIds(new Set()); }, [activeCollectionId, activeTag, statusFilter, selectedType, searchQuery]);

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
  const [serverSyncError, setServerSyncError] = useState<string | null>(null);
  const [localPersistenceError, setLocalPersistenceError] = useState(false);

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
  const trashRequestsRef = useRef(new Map<string, Promise<void>>());
  const queueTrashRequest = useCallback((id: string, request: () => Promise<Response>) => {
    const previous = trashRequestsRef.current.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const response = await request();
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
    }).catch((error) => console.warn('[Keepsake Web] Trash update failed:', error));
    trashRequestsRef.current.set(id, next);
    void next.finally(() => { if (trashRequestsRef.current.get(id) === next) trashRequestsRef.current.delete(id); });
  }, []);

  // Server Sync Engine (Keepsake Backend Persistence)
  // Server sync keeps three pieces of state so an idle library costs one tiny request:
  // the fingerprint of what the server last received, the server's revision tag, and a guard
  // against overlapping requests.
  const lastSyncedFingerprint = useRef('');
  const serverEtag = useRef<string | null>(null);
  const syncInFlight = useRef(false);
  const signedIn = Boolean(authSession?.apiToken);

  const syncWithServer = useCallback(async (options?: { silent?: boolean }) => {
    if (syncInFlight.current || !authSessionRef.current?.apiToken) return;
    syncInFlight.current = true;
    try {
      const storeToSend = storeRef.current;
      const fingerprint = libraryFingerprint(storeToSend);
      const dirty = fingerprint !== lastSyncedFingerprint.current;

      // Article text is fetched on demand (see ReaderModal), so it stays out of every sync.
      const res = dirty
        ? await fetch('/api/sync?readers=0', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store: storeToSend })
          })
        : await fetch('/api/sync?readers=0', { headers: serverEtag.current ? { 'If-None-Match': serverEtag.current } : {} });

      if (res.status === 304) {
        setServerSyncError(null);
        return;
      }
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      if (!data.store || !Array.isArray(data.store.bookmarks) || !Array.isArray(data.store.collections)) {
        throw new Error('Invalid server sync response');
      }
      setStore((prev) => {
        const merged = mergeStores(prev, data.store, deviceId).mergedStore;
        if (
          JSON.stringify(merged.bookmarks) !== JSON.stringify(prev.bookmarks) ||
          JSON.stringify(merged.collections) !== JSON.stringify(prev.collections) ||
          JSON.stringify(merged.tombstones) !== JSON.stringify(prev.tombstones) ||
          JSON.stringify(merged.savedSearches || []) !== JSON.stringify(prev.savedSearches || [])
        ) {
          storeRef.current = merged;
          return merged;
        }
        return prev;
      });
      // What was sent is now on the server. Anything merged in or edited since shows up as a new
      // difference and is pushed on the next tick.
      if (dirty) lastSyncedFingerprint.current = fingerprint;
      serverEtag.current = res.headers.get('ETag');
      setServerSyncError(null);
    } catch (err) {
      setServerSyncError(err instanceof Error ? err.message : 'Server unavailable');
      if (!options?.silent) {
        console.warn('[Keepsake Web] Server sync offline or unavailable:', err);
      }
    } finally {
      syncInFlight.current = false;
    }
  }, [deviceId]);

  // Sync once signed in, and again whenever the tab comes back into view
  useEffect(() => {
    if (signedIn) syncWithServer({ silent: true });
  }, [signedIn, syncWithServer]);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') syncWithServer({ silent: true });
    };
    window.addEventListener('focus', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('focus', handleVisible);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [syncWithServer]);

  // Poll every 5 seconds to catch extension and phone saves quickly, only while the tab is visible.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') syncWithServer({ silent: true });
    }, 5000);
    return () => clearInterval(interval);
  }, [syncWithServer]);

  // Listen for sync notifications from extension content script or BroadcastChannel
  useEffect(() => {
    const handleMsg = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'KEEPSAKE_SYNC_TRIGGER') {
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
      setLocalPersistenceError(false);
    } catch (e) {
      // Saved article text is what fills the browser's ~5 MB quota. Keep the library itself
      // (it is on the server too) and let articles be fetched again when opened.
      try {
        const slim = { ...store, bookmarks: store.bookmarks.map(({ readerContent, ...rest }) => (readerContent ? { ...rest, hasReader: true } : rest)) };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(slim));
        setLocalPersistenceError(false);
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
        setLocalPersistenceError(true);
      }
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

  // Forgets this account's library on this device so the next person or account does not see it.
  const resetLocalLibrary = useCallback(() => {
    const fresh = createDefaultStore(deviceId);
    storeRef.current = fresh;
    setStore(fresh);
    lastSyncedFingerprint.current = '';
    serverEtag.current = null;
    setDriveSyncEnabled(false);
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('keepsake_reader_position_') || key === LOCAL_STORAGE_KEY) localStorage.removeItem(key);
      }
    } catch {}
  }, [deviceId, setDriveSyncEnabled]);

  const logout = useCallback(() => {
    // Revoke this device's server session; failures (offline, already expired) are harmless.
    const apiToken = authSessionRef.current?.apiToken;
    if (apiToken) {
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    setAuthSession(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    resetLocalLibrary();
    setSyncStatus({ isSyncing: false, lastSyncedAt: null, error: null });
    try {
      (window as any).KeepsakeAndroid?.onLogout();
    } catch {}
  }, [resetLocalLibrary]);

  // The server rejected this device's session (expired, or revoked from another device): ask for a new sign-in.
  useEffect(() => {
    const onExpired = () => setServerSyncError('Server returned 401');
    window.addEventListener('keepsake:session-expired', onExpired);
    return () => window.removeEventListener('keepsake:session-expired', onExpired);
  }, []);

  // Signing out in one tab signs out the others, and a Drive token refresh in a stale tab can no longer
  // write an old session back.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEY) return;
      if (!event.newValue) {
        setAuthSession(null);
        resetLocalLibrary();
      } else {
        try { setAuthSession(JSON.parse(event.newValue)); } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [resetLocalLibrary]);

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

      // The short-lived Google access token is refreshed by the server, which keeps the
      // long-lived refresh token; the browser only sends its Keepsake session.
      if (session.tokens.expiresAt && Date.now() > session.tokens.expiresAt - 60000) {
        try {
          const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
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
          } else if (refreshRes.status === 409) {
            throw new Error('Google Drive needs you to sign in again.');
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes('sign in again')) throw e;
          console.warn('[Keepsake Web] Failed to refresh Google OAuth token:', e);
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
        // The Drive round trip is slow; merge into the latest state so edits made meanwhile survive.
        setStore((prev) => {
          const merged = mergeStores(prev, mergeResult.mergedStore, deviceId).mergedStore;
          storeRef.current = merged;
          return merged;
        });
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
  const updateBookmark = useCallback((id: string, changes: Partial<Bookmark>) => {
    // A field left undefined (the article text, when it was never loaded) must not erase the saved value.
    const updates = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Partial<Bookmark>;
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

  const addBookmark = useCallback(
    (bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt' | 'domain' | 'type'> & { type?: BookmarkType }) => {
      const now = new Date().toISOString();
      const cleanUrl = normalizeUrl(bookmarkData.url);
      const domain = extractDomain(cleanUrl);
      const ytThumb = getYouTubeThumbnail(cleanUrl);
      const isVideo = !!getYouTubeVideoId(cleanUrl);

      let cover = bookmarkData.cover;
      if (ytThumb && (!cover || cover.includes('yt_1200.png') || cover.includes('youtube.com/img/desktop'))) {
        cover = ytThumb;
      }

      let title = bookmarkData.title;
      let tags = bookmarkData.tags || [];
      let favicon = bookmarkData.favicon || getFaviconUrl(domain);

      if (isRedditUrl(cleanUrl)) {
        title = cleanRedditTitle(title) || title;
        const rInfo = parseRedditUrl(cleanUrl);
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
        url: cleanUrl,
        title: title || domain,
        domain,
        favicon,
        cover,
        tags,
        isDone: bookmarkData.isDone || false,
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

      // Auto-enrich in background if metadata/cover is sparse or missing (same as extension)
      const needsCover = !cover;
      const sparseTitle = isSparseTitle(title, domain, cleanUrl);
      const needsEnrichment = needsCover || !bookmarkData.description || sparseTitle;

      if (needsEnrichment && cleanUrl.startsWith('http')) {
        (async () => {
          try {
            const res = await fetch(`/api/scrape?url=${encodeURIComponent(cleanUrl)}`);
            if (res.ok) {
              const meta = await res.json();
              updateBookmark(newBm.id, {
                title: (!sparseTitle && title) ? title : (meta.title || newBm.title),
                description: bookmarkData.description || meta.description || newBm.description,
                cover: cover || meta.cover || newBm.cover,
                favicon: meta.favicon || newBm.favicon,
                type: (meta.type && meta.type !== 'link') ? meta.type : newBm.type,
                readerContent: meta.readerContent
              });
            }
          } catch (err) {
            console.warn('[Keepsake Web] addBookmark background auto-enrich failed:', err);
          }
        })();
      }

      return newBm;
    },
    [updateBookmark]
  );

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
      const knownUrls = new Set(storeRef.current.bookmarks.filter((bm) => !bm.isTrash).map((bm) => normalizeUrl(bm.url)));

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const cleanUrl = normalizeUrl(item.url);
        if (knownUrls.has(cleanUrl)) continue;
        knownUrls.add(cleanUrl);
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
          isDone: false,
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
    async (rawUrl: string, targetCollectionId?: string, initialTitle?: string): Promise<Bookmark | undefined> => {
      const res = await saveBookmarksToCollection([{ url: rawUrl, title: initialTitle }], targetCollectionId);
      return res[0];
    },
    [saveBookmarksToCollection]
  );

  const toggleFavorite = useCallback((id: string) => {
    const current = storeRef.current.bookmarks.find((b) => b.id === id);
    if (!current) return;
    const now = new Date().toISOString();
    const next = !current.isFavorite;
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((b) => (b.id === id ? { ...b, isFavorite: next, updatedAt: now } : b))
    }));
    // Send only the changed field; the request must not happen inside the state updater.
    fetch(`/api/bookmarks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: next })
    }).catch((e) => console.warn('[Keepsake Web] toggleFavorite server persist error:', e));
  }, []);

  const toggleDone = useCallback((id: string) => {
    const current = storeRef.current.bookmarks.find((b) => b.id === id);
    if (!current) return;
    const now = new Date().toISOString();
    const next = !current.isDone;
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((b) => (b.id === id ? { ...b, isDone: next, updatedAt: now } : b))
    }));
    // Send only the changed field; the request must not happen inside the state updater.
    fetch(`/api/bookmarks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: next })
    }).catch((e) => console.warn('[Keepsake Web] toggleDone server persist error:', e));
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

    queueTrashRequest(id, () => fetch(`/api/bookmarks/${id}`, {
      method: 'DELETE'
    }));
  }, [queueTrashRequest]);

  const restoreFromTrash = useCallback((id: string) => {
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.map((bm) => (bm.id === id ? { ...bm, isTrash: false, updatedAt: now } : bm))
    }));

    queueTrashRequest(id, () => fetch(`/api/bookmarks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTrash: false })
    }));
  }, [queueTrashRequest]);

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
    const prev = storeRef.current;
    const trashed = prev.bookmarks.filter((bm) => bm.isTrash);
    if (trashed.length === 0) return;
    const now = new Date().toISOString();
    const newTombstones: SyncTombstone[] = trashed.map((bm) => ({
      id: bm.id,
      type: 'bookmark',
      deletedAt: now
    }));
    const nextStore: KeepsakeDataStore = {
      ...prev,
      lastModified: now,
      bookmarks: prev.bookmarks.filter((bm) => !bm.isTrash),
      tombstones: [...(prev.tombstones || []), ...newTombstones]
    };
    storeRef.current = nextStore;
    setStore(nextStore);
    // Full sync to server
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: nextStore })
    }).catch(() => {});
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

  const bulkDone = useCallback(
    (isDone: boolean) => {
      const ids = Array.from(selectedBookmarkIds);
      const now = new Date().toISOString();
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) =>
          ids.includes(bm.id) ? { ...bm, isDone, updatedAt: now } : bm
        )
      }));

      ids.forEach((id) => {
        fetch(`/api/bookmarks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDone })
        }).catch((e) => console.warn('[Keepsake Web] bulkDone persist error:', e));
      });
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

      // Requests are sent outside the state updater, which React may run more than once.
      for (const bm of storeRef.current.bookmarks) {
        if (ids.includes(bm.id) && !bm.tags.includes(cleanTag)) {
          fetch(`/api/bookmarks/${bm.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: [...bm.tags, cleanTag] })
          }).catch((e) => console.warn('[Keepsake Web] addTagToBookmark persist error:', e));
        }
      }
      setStore((prev) => ({
        ...prev,
        lastModified: now,
        bookmarks: prev.bookmarks.map((bm) =>
          ids.includes(bm.id) && !bm.tags.includes(cleanTag) ? { ...bm, tags: [...bm.tags, cleanTag], updatedAt: now } : bm
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
        collections: prev.collections.filter((col) => col.id !== id).map((col) => col.parentId === id ? { ...col, parentId: prev.collections.find((parent) => parent.id === id)?.parentId || null, updatedAt: now } : col),
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

  const renameTag = useCallback((oldTag: string, newTag: string) => {
    const clean = newTag.trim().toLowerCase().replace(/^#/, '');
    if (!clean) return;
    const now = new Date().toISOString();
    setStore((prev) => ({ ...prev, lastModified: now, bookmarks: prev.bookmarks.map((bm) =>
      bm.tags.includes(oldTag) ? { ...bm, tags: Array.from(new Set(bm.tags.map((tag) => tag === oldTag ? clean : tag))), updatedAt: now } : bm
    ) }));
    setActiveTag((current) => current === oldTag ? clean : current);
  }, []);

  const saveSearch = useCallback((name: string, query: string) => {
    const cleanName = name.trim();
    const cleanQuery = query.trim();
    if (!cleanName || !cleanQuery) return;
    const now = new Date().toISOString();
    setStore((prev) => {
      const existing = (prev.savedSearches || []).find((item) => !item.deletedAt && item.name.toLowerCase() === cleanName.toLowerCase());
      const item = { id: existing?.id || `search_${deviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: cleanName, query: cleanQuery, updatedAt: now };
      return { ...prev, lastModified: now, savedSearches: [...(prev.savedSearches || []).filter((entry) => entry.id !== item.id), item] };
    });
  }, [deviceId]);

  const deleteSavedSearch = useCallback((id: string) => {
    const now = new Date().toISOString();
    setStore((prev) => ({ ...prev, lastModified: now, savedSearches: (prev.savedSearches || []).map((item) => item.id === id ? { ...item, updatedAt: now, deletedAt: now } : item) }));
  }, []);

  const removeTag = useCallback((tag: string) => {
    const now = new Date().toISOString();
    setStore((prev) => ({ ...prev, lastModified: now, bookmarks: prev.bookmarks.map((bm) =>
      bm.tags.includes(tag) ? { ...bm, tags: bm.tags.filter((item) => item !== tag), updatedAt: now } : bm
    ) }));
    setActiveTag((current) => current === tag ? null : current);
  }, []);

  // Filtered and Sorted Bookmarks for current active view
  // Typing stays responsive in big libraries: filtering follows the input at a lower priority.
  const deferredSearch = useDeferredValue(searchQuery);
  const filteredBookmarks = useMemo(() => {
    const parsedSearch = parseSearchQuery(deferredSearch);

    return store.bookmarks
      .filter((bm) => {
        // Trash view
        if (activeCollectionId === 'trash' ? !bm.isTrash : bm.isTrash) return false;

        // Active collection filter
        if (activeCollectionId === 'trash') {
          // Continue through the shared search and filter checks.
        } else if (activeCollectionId === 'favorites') {
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

        // Status filter (Only Pending / Only Done)
        if (statusFilter === 'pending' && bm.isDone) {
          return false;
        }
        if (statusFilter === 'done' && !bm.isDone) {
          return false;
        }

        // Search criteria
        if (deferredSearch.trim() && !matchesSearch(bm, parsedSearch)) {
          return false;
        }

        return true;
      })
      // Dates are parsed once per bookmark, not once per comparison.
      .map((bm) => ({ bm, time: sortField === 'createdAt' ? Date.parse(bm.createdAt) : sortField === 'updatedAt' ? Date.parse(bm.updatedAt) : 0 }))
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'createdAt' || sortField === 'updatedAt') {
          cmp = a.time - b.time;
        } else if (sortField === 'title') {
          cmp = (a.bm.title || '').localeCompare(b.bm.title || '');
        } else if (sortField === 'domain') {
          cmp = (a.bm.domain || '').localeCompare(b.bm.domain || '');
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      })
      .map((entry) => entry.bm);
  }, [
    store.bookmarks,
    activeCollectionId,
    activeTag,
    statusFilter,
    selectedType,
    deferredSearch,
    sortField,
    sortOrder
  ]);

  // Count Badges for System Collections & Status
  const counts = useMemo(() => {
    let allCount = 0;
    let unsortedCount = 0;
    let favoritesCount = 0;
    let trashCount = 0;
    let pendingCount = 0;
    let doneCount = 0;

    for (const bm of store.bookmarks) {
      if (bm.isTrash) {
        trashCount++;
      } else {
        allCount++;
        if (bm.collectionId === 'unsorted') unsortedCount++;
        if (bm.isFavorite) favoritesCount++;
        if (bm.isDone) {
          doneCount++;
        } else {
          pendingCount++;
        }
      }
    }

    return { allCount, unsortedCount, favoritesCount, trashCount, pendingCount, doneCount };
  }, [store.bookmarks]);

  // Import Netscape HTML / JSON
  const enrichImportedCovers = useCallback(async (items: Bookmark[]) => {
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < items.length) {
        const bookmark = items[nextIndex++];
        try {
          const response = await fetch(`/api/scrape?url=${encodeURIComponent(bookmark.url)}`);
          if (!response.ok) continue;
          const metadata = await response.json();
          if (typeof metadata.cover !== 'string' || !metadata.cover) continue;
          setStore((prev) => {
            const current = prev.bookmarks.find((item) => item.id === bookmark.id);
            if (!current || current.isTrash || current.url !== bookmark.url || current.cover) return prev;
            const now = new Date().toISOString();
            return { ...prev, lastModified: now, bookmarks: prev.bookmarks.map((item) => item.id === bookmark.id ? { ...item, cover: metadata.cover, updatedAt: now } : item) };
          });
        } catch { /* Offline or unsupported pages remain saved without a cover. */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
  }, []);

  const importData = useCallback(
    (content: string, format: 'html' | 'json') => {
      const now = new Date().toISOString();
      if (format === 'json') {
        const parsed = parseBackup(content);
        const mergeResult = mergeStores(storeRef.current, parsed, deviceId);
        // Merge into the latest state so changes that arrived since this render are kept.
        setStore((prev) => {
          const merged = mergeStores(prev, mergeResult.mergedStore, deviceId).mergedStore;
          storeRef.current = merged;
          return merged;
        });
        return { importedCount: mergeResult.bookmarksUpdated, skippedCount: Math.max(0, parsed.bookmarks.length - mergeResult.bookmarksUpdated) };
      } else {
        const parsedItems = parseNetscapeHtml(content);
        const colMap = new Map<string, Collection>();
        storeRef.current.collections.forEach((c) => colMap.set(c.title.toLowerCase(), c));

        const newBookmarks: Bookmark[] = [];
        const newCols: Collection[] = [];
        const knownUrls = new Set(storeRef.current.bookmarks.filter((bm) => !bm.isTrash).map((bm) => normalizeUrl(bm.url)));

        for (const item of parsedItems) {
          const cleanUrl = normalizeUrl(item.url);
          if (knownUrls.has(cleanUrl)) continue;
          knownUrls.add(cleanUrl);
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
                sortOrder: storeRef.current.collections.length + newCols.length,
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
            url: cleanUrl,
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

        if (newBookmarks.length) setTimeout(() => { void enrichImportedCovers(newBookmarks); }, 0);

        return { importedCount: newBookmarks.length, skippedCount: parsedItems.length - newBookmarks.length };
      }
      return { importedCount: 0 };
    },
    [deviceId, enrichImportedCovers]
  );

  return {
    store,
    bookmarks: filteredBookmarks,
    collections: store.collections,
    allTags,
    savedSearches: (store.savedSearches || []).filter((item) => !item.deletedAt),
    saveSearch,
    deleteSavedSearch,
    renameTag,
    removeTag,
    counts,
    activeCollectionId,
    setActiveCollectionId: selectCollection,
    selectCollection,
    activeTag,
    setActiveTag,
    statusFilter,
    setStatusFilter,
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
    serverSyncError,
    localPersistenceError,
    addBookmark,
    saveUrlToCollection,
    saveBookmarksToCollection,
    updateBookmark,
    toggleFavorite,
    toggleDone,
    moveToTrash,
    restoreFromTrash,
    permanentlyDeleteBookmark,
    emptyTrash,
    bulkDelete,
    bulkMove,
    bulkAddTag,
    bulkFavorite,
    bulkDone,
    moveBookmarkToCollection,
    addTagToBookmark,
    addCollection,
    updateCollection,
    deleteCollection,
    reorderCollections,
    importData,
    enrichImportedCovers
  };
}
