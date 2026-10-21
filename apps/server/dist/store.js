import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDefaultStore, mergeStores, extractDomain, getFaviconUrl, normalizeUrl, getYouTubeThumbnail, getYouTubeVideoId } from '@keepsake/shared';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const findDefaultDataDir = () => {
    if (process.env.DATA_DIR)
        return process.env.DATA_DIR;
    const rootData = path.resolve(__dirname, '../../../data');
    const cwdData = path.resolve(process.cwd(), 'data');
    if (fs.existsSync(rootData))
        return rootData;
    if (fs.existsSync(cwdData))
        return cwdData;
    return rootData;
};
const DATA_DIR = findDefaultDataDir();
const STORE_PATH = path.join(DATA_DIR, 'store.json');
class ServerStoreManager {
    store;
    constructor() {
        this.ensureDataDir();
        this.store = this.loadOrCreateStore();
    }
    ensureDataDir() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }
    loadOrCreateStore() {
        try {
            if (fs.existsSync(STORE_PATH)) {
                const raw = fs.readFileSync(STORE_PATH, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.bookmarks) && Array.isArray(parsed.collections)) {
                    return parsed;
                }
            }
        }
        catch (err) {
            console.error('[ServerStore] Failed to read store.json, creating new default store:', err);
        }
        const defaultStore = createDefaultStore('server');
        this.persist(defaultStore);
        return defaultStore;
    }
    persist(newStore) {
        try {
            this.ensureDataDir();
            const tmpPath = `${STORE_PATH}.tmp.${Date.now()}`;
            fs.writeFileSync(tmpPath, JSON.stringify(newStore, null, 2), 'utf-8');
            fs.renameSync(tmpPath, STORE_PATH);
        }
        catch (err) {
            console.error('[ServerStore] Failed to persist store to disk:', err);
            // Fallback synchronous write
            try {
                fs.writeFileSync(STORE_PATH, JSON.stringify(newStore, null, 2), 'utf-8');
            }
            catch (e) {
                console.error('[ServerStore] Fallback write also failed:', e);
            }
        }
    }
    getStore() {
        return this.store;
    }
    saveStore(newStore) {
        this.store = {
            ...newStore,
            lastModified: new Date().toISOString()
        };
        this.persist(this.store);
        return this.store;
    }
    merge(remoteStore) {
        const result = mergeStores(this.store, remoteStore, 'server');
        this.store = result.mergedStore;
        this.persist(this.store);
        return this.store;
    }
    listBookmarks(filter) {
        let list = this.store.bookmarks;
        if (filter?.url) {
            const normalized = normalizeUrl(filter.url);
            list = list.filter((b) => normalizeUrl(b.url) === normalized);
        }
        if (filter?.isTrash !== undefined) {
            const isTrashVal = filter.isTrash === true || filter.isTrash === 'true';
            list = list.filter((b) => Boolean(b.isTrash) === isTrashVal);
        }
        if (filter?.collectionId) {
            if (filter.collectionId === 'favorites') {
                list = list.filter((b) => b.isFavorite);
            }
            else if (filter.collectionId !== 'all') {
                list = list.filter((b) => b.collectionId === filter.collectionId);
            }
        }
        if (filter?.search) {
            const q = filter.search.toLowerCase();
            list = list.filter((b) => b.title.toLowerCase().includes(q) ||
                b.url.toLowerCase().includes(q) ||
                b.description.toLowerCase().includes(q) ||
                (b.note && b.note.toLowerCase().includes(q)) ||
                b.tags.some((t) => t.toLowerCase().includes(q)));
        }
        return list;
    }
    getBookmark(id) {
        return this.store.bookmarks.find((b) => b.id === id);
    }
    addOrUpdateBookmark(data) {
        const now = new Date().toISOString();
        const cleanUrl = normalizeUrl(data.url);
        const domain = data.domain || extractDomain(cleanUrl);
        const favicon = data.favicon || getFaviconUrl(domain);
        // Auto-detect YouTube thumbnail and video type
        const ytThumb = getYouTubeThumbnail(cleanUrl);
        const isVideo = !!getYouTubeVideoId(cleanUrl);
        let cover = data.cover;
        if (ytThumb && (!cover || cover.includes('yt_1200.png') || cover.includes('youtube.com/img/desktop'))) {
            cover = ytThumb;
        }
        const bookmarkType = isVideo ? 'video' : (data.type || 'link');
        let existingIndex = -1;
        if (data.id) {
            existingIndex = this.store.bookmarks.findIndex((b) => b.id === data.id);
        }
        if (existingIndex === -1) {
            existingIndex = this.store.bookmarks.findIndex((b) => normalizeUrl(b.url) === cleanUrl && !b.isTrash);
        }
        let savedBm;
        if (existingIndex >= 0) {
            // Update existing
            const existing = this.store.bookmarks[existingIndex];
            savedBm = {
                ...existing,
                ...data,
                id: existing.id,
                url: cleanUrl,
                domain,
                favicon: favicon || existing.favicon,
                cover: cover !== undefined ? cover : existing.cover,
                type: bookmarkType,
                tags: data.tags !== undefined ? data.tags : existing.tags,
                updatedAt: now
            };
            this.store.bookmarks[existingIndex] = savedBm;
        }
        else {
            // Create new
            savedBm = {
                id: data.id ||
                    'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
                url: cleanUrl,
                title: data.title || domain,
                description: data.description || '',
                note: data.note || '',
                domain,
                favicon,
                cover,
                collectionId: data.collectionId || 'unsorted',
                tags: data.tags || [],
                isFavorite: data.isFavorite || false,
                isTrash: data.isTrash || false,
                type: bookmarkType,
                createdAt: data.createdAt || now,
                updatedAt: now,
                readerContent: data.readerContent
            };
            this.store.bookmarks.unshift(savedBm);
        }
        this.store.lastModified = now;
        this.persist(this.store);
        return savedBm;
    }
    deleteBookmark(id, permanent = false) {
        const now = new Date().toISOString();
        const existingIndex = this.store.bookmarks.findIndex((b) => b.id === id);
        if (existingIndex === -1) {
            return false;
        }
        if (permanent) {
            this.store.bookmarks.splice(existingIndex, 1);
            const tombstone = { id, type: 'bookmark', deletedAt: now };
            this.store.tombstones = [...(this.store.tombstones || []), tombstone];
        }
        else {
            this.store.bookmarks[existingIndex] = {
                ...this.store.bookmarks[existingIndex],
                isTrash: true,
                updatedAt: now
            };
        }
        this.store.lastModified = now;
        this.persist(this.store);
        return true;
    }
    listCollections() {
        return this.store.collections;
    }
    getCollection(id) {
        return this.store.collections.find((c) => c.id === id);
    }
    addOrUpdateCollection(data) {
        const now = new Date().toISOString();
        let existingIndex = -1;
        if (data.id) {
            existingIndex = this.store.collections.findIndex((c) => c.id === data.id);
        }
        let savedCol;
        if (existingIndex >= 0) {
            const existing = this.store.collections[existingIndex];
            savedCol = {
                ...existing,
                ...data,
                updatedAt: now
            };
            this.store.collections[existingIndex] = savedCol;
        }
        else {
            savedCol = {
                id: data.id || 'col_' + Math.random().toString(36).substring(2, 9),
                title: data.title,
                description: data.description,
                icon: data.icon,
                color: data.color,
                isSystem: data.isSystem || false,
                sortOrder: data.sortOrder !== undefined ? data.sortOrder : this.store.collections.length,
                defaultViewMode: data.defaultViewMode,
                createdAt: data.createdAt || now,
                updatedAt: now
            };
            this.store.collections.push(savedCol);
        }
        this.store.lastModified = now;
        this.persist(this.store);
        return savedCol;
    }
    deleteCollection(id) {
        if (id === 'unsorted')
            return false; // Prevent deleting default unsorted
        const now = new Date().toISOString();
        const existingIndex = this.store.collections.findIndex((c) => c.id === id);
        if (existingIndex === -1)
            return false;
        // Remove collection and create tombstone
        this.store.collections.splice(existingIndex, 1);
        const tombstone = { id, type: 'collection', deletedAt: now };
        this.store.tombstones = [...(this.store.tombstones || []), tombstone];
        // Reassign bookmarks belonging to this collection to unsorted
        for (let i = 0; i < this.store.bookmarks.length; i++) {
            if (this.store.bookmarks[i].collectionId === id) {
                this.store.bookmarks[i] = {
                    ...this.store.bookmarks[i],
                    collectionId: 'unsorted',
                    updatedAt: now
                };
            }
        }
        this.store.lastModified = now;
        this.persist(this.store);
        return true;
    }
}
export const serverStore = new ServerStoreManager();
