import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanReaderContent } from './sanitize.js';
import { createDefaultStore, mergeStores, extractDomain, getFaviconUrl, normalizeUrl, getYouTubeThumbnail, getYouTubeVideoId, isRedditUrl, parseRedditUrl, cleanRedditTitle, cleanRedditMediaUrl, isGenericRedditMedia, isSparseTitle, sanitizeStoreInput } from '@keepsake/shared';
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
export const DATA_DIR = findDefaultDataDir();
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
                    return this.repairLoadedStore(parsed);
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
    /**
     * Malformed records (for example a bookmark synced without a URL) would make
     * searches and saves fail on every start. Keep a copy of the file, then drop them.
     */
    repairLoadedStore(parsed) {
        const result = sanitizeStoreInput(parsed);
        if (!result)
            return parsed;
        const droppedCount = Object.values(result.dropped).reduce((sum, count) => sum + count, 0);
        if (droppedCount === 0)
            return parsed;
        const copy = `${STORE_PATH}.pre-repair-${Date.now()}`;
        fs.copyFileSync(STORE_PATH, copy);
        console.warn(`[ServerStore] Dropped ${droppedCount} malformed record(s) from ${STORE_PATH}; the original was kept at ${copy}`);
        const repaired = this.withSystemCollections(this.fixOrphans(result.store));
        this.persist(repaired);
        return repaired;
    }
    withSystemCollections(store) {
        if (!store.collections.some((c) => c.id === 'unsorted')) {
            store.collections.unshift(createDefaultStore('server').collections[0]);
        }
        return store;
    }
    /** Points bookmarks and sub-collections at Unsorted/top level when their collection no longer exists. */
    fixOrphans(store) {
        const now = new Date().toISOString();
        const ids = new Set(store.collections.map((c) => c.id));
        ids.add('unsorted');
        store.bookmarks = store.bookmarks.map((b) => (ids.has(b.collectionId) ? b : { ...b, collectionId: 'unsorted', updatedAt: now }));
        store.collections = store.collections.map((c) => (c.parentId && !ids.has(c.parentId) ? { ...c, parentId: null, updatedAt: now } : c));
        return store;
    }
    // Identifies the stored data for conditional requests. A random boot id keeps a restarted
    // server from ever reusing a revision a client has already seen.
    bootId = Math.random().toString(36).slice(2, 8);
    revisionCounter = 0;
    getRevision() {
        return `${this.bootId}-${this.revisionCounter}`;
    }
    batchDepth = 0;
    dirtyInBatch = false;
    lastSnapshotDay = '';
    /** Runs several changes and writes the store to disk once at the end (imports of thousands of items). */
    batch(work) {
        this.batchDepth++;
        try {
            return work();
        }
        finally {
            this.batchDepth--;
            if (this.batchDepth === 0 && this.dirtyInBatch) {
                this.dirtyInBatch = false;
                this.persist(this.store);
            }
        }
    }
    /** Keeps one copy of the store per day (seven days) so a bad sync or import can be rolled back. */
    snapshotDaily() {
        const day = new Date().toISOString().slice(0, 10);
        if (day === this.lastSnapshotDay || !fs.existsSync(STORE_PATH))
            return;
        try {
            const dir = path.join(DATA_DIR, 'backups');
            fs.mkdirSync(dir, { recursive: true });
            const target = path.join(dir, `store-${day}.json`);
            if (!fs.existsSync(target))
                fs.copyFileSync(STORE_PATH, target);
            this.lastSnapshotDay = day;
            const old = fs.readdirSync(dir).filter((name) => /^store-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().slice(0, -7);
            for (const name of old)
                fs.rmSync(path.join(dir, name), { force: true });
        }
        catch (err) {
            console.warn('[ServerStore] Could not write the daily backup:', err);
        }
    }
    persist(newStore) {
        if (this.batchDepth > 0) {
            this.dirtyInBatch = true;
            return;
        }
        const tmpPath = `${STORE_PATH}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
        try {
            this.ensureDataDir();
            this.snapshotDaily();
            fs.writeFileSync(tmpPath, JSON.stringify(newStore), 'utf-8');
            fs.renameSync(tmpPath, STORE_PATH);
            this.revisionCounter++;
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
    /**
     * Merges a client's store. The payload is validated first: malformed records
     * are dropped, non-web URLs refused, far-future timestamps clamped (a client
     * with a wrong clock must not win every conflict forever), and tombstones for
     * system collections ignored. Returns null when the payload is not a store.
     */
    merge(remoteStore) {
        const sanitized = sanitizeStoreInput(remoteStore, { requireHttpUrls: true });
        if (!sanitized)
            return null;
        const storedReaders = new Map(this.store.bookmarks.map((b) => [b.id, b.readerContent]));
        for (const bookmark of sanitized.store.bookmarks) {
            if (bookmark.readerContent)
                bookmark.readerContent = cleanReaderContent(bookmark.readerContent, storedReaders.get(bookmark.id));
            // Clients may leave article text out of what they send (they fetch it on demand); never let that erase it.
            else if (storedReaders.get(bookmark.id))
                bookmark.readerContent = storedReaders.get(bookmark.id);
            delete bookmark.hasReader;
        }
        const result = mergeStores(this.store, sanitized.store, 'server');
        this.store = this.withSystemCollections(this.fixOrphans(result.mergedStore));
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
    /**
     * Creates a bookmark or updates the one with the same id or URL.
     * - Fields that are `undefined` never overwrite stored values.
     * - mode 'capture' (quick-saves, imports): an existing bookmark only has
     *   empty metadata filled in; its collection, tags, note and flags are untouched.
     */
    addOrUpdateBookmark(data, options = {}) {
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
            if (options.mode === 'capture') {
                const filled = this.fillMissingMetadata(existing, data, now);
                if (filled === existing)
                    return existing;
                this.store.bookmarks[existingIndex] = filled;
                this.store.lastModified = now;
                this.persist(this.store);
                return filled;
            }
            const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
            const isVideo = !!getYouTubeVideoId(cleanUrl);
            const updatedCover = data.cover !== undefined ? data.cover : existing.cover;
            const updatedType = data.type !== undefined ? data.type : (isVideo ? 'video' : existing.type);
            savedBm = {
                ...existing,
                ...defined,
                readerContent: cleanReaderContent(defined.readerContent ?? existing.readerContent, existing.readerContent),
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
                readerContent: cleanReaderContent(data.readerContent)
            };
            this.store.bookmarks.unshift(savedBm);
        }
        this.store.lastModified = now;
        this.persist(this.store);
        return savedBm;
    }
    fillMissingMetadata(existing, data, now) {
        const updates = {};
        if (data.title && isSparseTitle(existing.title, existing.domain, existing.url) && !isSparseTitle(data.title, existing.domain, existing.url))
            updates.title = data.title;
        if (!existing.description && data.description)
            updates.description = data.description;
        if (!existing.excerpt && data.excerpt)
            updates.excerpt = data.excerpt;
        if (!existing.favicon && data.favicon)
            updates.favicon = data.favicon;
        if ((!existing.cover || isGenericRedditMedia(existing.cover)) && data.cover && !isGenericRedditMedia(data.cover))
            updates.cover = data.cover;
        if (existing.type === 'link' && data.type && data.type !== 'link')
            updates.type = data.type;
        if (!existing.readerContent && data.readerContent)
            updates.readerContent = cleanReaderContent(data.readerContent);
        return Object.keys(updates).length === 0 ? existing : { ...existing, ...updates, updatedAt: now };
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
