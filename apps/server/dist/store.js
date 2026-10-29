import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDefaultStore, mergeStores, extractDomain, getFaviconUrl, normalizeUrl, getYouTubeThumbnail, getYouTubeVideoId, isRedditUrl, parseRedditUrl, cleanRedditTitle, cleanRedditMediaUrl, isGenericRedditMedia } from '@keepsake/shared';
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
        if (fs.existsSync(STORE_PATH)) {
            try {
                const raw = fs.readFileSync(STORE_PATH, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.bookmarks) && Array.isArray(parsed.collections)) {
                    return parsed;
                }
                throw new Error('Store is missing bookmark or collection lists');
            }
            catch (err) {
                throw new Error(`Unable to read existing store at ${STORE_PATH}; the file was not modified`, { cause: err });
            }
        }
        const defaultStore = createDefaultStore('server');
        this.persist(defaultStore);
        return defaultStore;
    }
    persist(newStore) {
        const tmpPath = `${STORE_PATH}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
        try {
            this.ensureDataDir();
            fs.writeFileSync(tmpPath, JSON.stringify(newStore, null, 2), 'utf-8');
            fs.renameSync(tmpPath, STORE_PATH);
        }
        catch (err) {
            console.error('[ServerStore] Failed to persist store to disk:', err);
            try {
                if (fs.existsSync(tmpPath))
                    fs.unlinkSync(tmpPath);
            }
            catch { }
            // Several operations update the in-memory store before persisting; roll
            // it back to the last committed file if the atomic replacement failed.
            try {
                const committed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
                if (Array.isArray(committed.bookmarks) && Array.isArray(committed.collections))
                    this.store = committed;
            }
            catch { }
            throw new Error('Could not save the Keepsake store', { cause: err });
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
        if (filter?.isDone !== undefined) {
            const isDoneVal = filter.isDone === true || filter.isDone === 'true';
            list = list.filter((b) => Boolean(b.isDone) === isDoneVal);
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
        let existingIndex = -1;
        if (data.id) {
            existingIndex = this.store.bookmarks.findIndex((b) => b.id === data.id);
        }
        if (existingIndex === -1) {
            existingIndex = this.store.bookmarks.findIndex((b) => normalizeUrl(b.url) === cleanUrl && !b.isTrash);
        }
        let savedBm;
        if (existingIndex >= 0) {
            // Update existing - preserve all existing fields unless explicitly updated
            const existing = this.store.bookmarks[existingIndex];
            const isVideo = !!getYouTubeVideoId(cleanUrl);
            const updatedCover = data.cover !== undefined ? data.cover : existing.cover;
            const updatedType = data.type !== undefined ? data.type : (isVideo ? 'video' : existing.type);
            savedBm = {
                ...existing,
                ...data,
                id: existing.id,
                url: cleanUrl,
                title: data.title !== undefined ? data.title : existing.title,
                domain: data.domain || existing.domain || extractDomain(cleanUrl),
                favicon: data.favicon !== undefined ? data.favicon : existing.favicon,
                cover: updatedCover,
                type: updatedType,
                isDone: data.isDone !== undefined ? Boolean(data.isDone) : (existing.isDone || false),
                tags: data.tags !== undefined ? data.tags : existing.tags,
                updatedAt: now
            };
            this.store.bookmarks[existingIndex] = savedBm;
        }
        else {
            // Create new
            const domain = data.domain || extractDomain(cleanUrl);
            let favicon = data.favicon || getFaviconUrl(domain);
            let title = data.title || domain;
            let tags = data.tags !== undefined ? data.tags : [];
            // Auto-detect YouTube thumbnail and video type
            const ytThumb = getYouTubeThumbnail(cleanUrl);
            const isVideo = !!getYouTubeVideoId(cleanUrl);
            let cover = data.cover;
            if (ytThumb && (!cover || cover.includes('yt_1200.png') || cover.includes('youtube.com/img/desktop'))) {
                cover = ytThumb;
            }
            // Auto-detect Reddit posts: clean title, extract subreddit tag, set Reddit favicon, clean media
            if (isRedditUrl(cleanUrl)) {
                title = cleanRedditTitle(title) || title;
                const rInfo = parseRedditUrl(cleanUrl);
                if (rInfo?.subreddit && tags.length === 0) {
                    tags = [rInfo.subreddit.toLowerCase()];
                }
                if (!data.favicon || data.favicon.includes('google.com')) {
                    favicon = 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png';
                }
                if (cover) {
                    cover = cleanRedditMediaUrl(cover);
                }
                if (cover && isGenericRedditMedia(cover)) {
                    cover = undefined;
                }
            }
            const bookmarkType = isVideo ? 'video' : (data.type || (cover ? 'image' : 'link'));
            savedBm = {
                id: data.id ||
                    'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
                url: cleanUrl,
                title: title,
                description: data.description || '',
                note: data.note || '',
                domain,
                favicon,
                cover,
                collectionId: data.collectionId || 'unsorted',
                tags,
                isFavorite: data.isFavorite || false,
                isTrash: data.isTrash || false,
                isDone: data.isDone || false,
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
        return [...this.store.collections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    reorderCollections(orderedIds) {
        const now = new Date().toISOString();
        const idOrderMap = new Map();
        orderedIds.forEach((id, index) => {
            idOrderMap.set(id, index + 1);
        });
        this.store.collections = this.store.collections.map((col) => {
            if (idOrderMap.has(col.id)) {
                return {
                    ...col,
                    sortOrder: idOrderMap.get(col.id),
                    updatedAt: now
                };
            }
            return col;
        });
        this.store.collections.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        this.store.lastModified = now;
        this.persist(this.store);
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
                parentId: data.parentId,
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
        const parentId = this.store.collections[existingIndex].parentId || null;
        this.store.collections = this.store.collections.map((col) => col.parentId === id ? { ...col, parentId, updatedAt: now } : col);
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
