"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READER_PURIFY_CONFIG = exports.SYSTEM_COLLECTION_IDS = void 0;
exports.isHttpUrl = isHttpUrl;
exports.safeHref = safeHref;
exports.toSafeBookmarkUrl = toSafeBookmarkUrl;
exports.sanitizeBookmarkInput = sanitizeBookmarkInput;
exports.sanitizeCollectionInput = sanitizeCollectionInput;
exports.sanitizeStoreInput = sanitizeStoreInput;
const utils_js_1 = require("./utils.js");
/**
 * Input validation shared by the server routes, sync and import paths.
 * Nothing here trusts the shape of what clients send: wrong types are
 * rejected (single records) or dropped (whole-store payloads) instead of
 * being stored and breaking search or saves later.
 */
const BOOKMARK_TYPES = ['link', 'article', 'image', 'video', 'document', 'audio'];
const VIEW_MODES = ['cards', 'list', 'headlines', 'moodboard'];
exports.SYSTEM_COLLECTION_IDS = ['unsorted', 'all', 'trash', 'favorites'];
const LIMITS = { url: 4096, title: 1000, description: 10000, note: 100000, id: 200, domain: 253, tag: 100, tags: 100, readerText: 2_000_000 };
/** True for http(s) URLs only; javascript:, data:, file: and friends are rejected. */
function isHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.url)
        return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
/** href for a stored bookmark URL: the URL itself when it is a web link, otherwise an inert "#". */
function safeHref(url) {
    return isHttpUrl(url) ? url.trim() : '#';
}
/**
 * Settings for DOMPurify (client and server) when cleaning scraped article HTML.
 * HTML only (no SVG/MathML), no styles or form controls, no script or event handlers
 * (DOMPurify removes those itself), and only safe URL schemes.
 */
exports.READER_PURIFY_CONFIG = {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'frame', 'object', 'embed', 'link', 'base', 'meta'],
    FORBID_ATTR: ['style', 'srcset', 'srcdoc', 'formaction', 'ping']
};
/** Normalizes a user-supplied link and returns it only if it is a safe web URL. */
function toSafeBookmarkUrl(value) {
    if (typeof value !== 'string')
        return null;
    // normalizeUrl prefixes https:// to anything that does not start with http, so
    // an explicit other scheme (file:, javascript:, ftp:) has to be refused first.
    // "host:8080/path" is a host and port, not a scheme.
    const scheme = value.trim().match(/^([a-z][a-z0-9+.-]*):(?!\d+([/?#]|$))/i);
    if (scheme && !/^https?$/i.test(scheme[1]))
        return null;
    const normalized = (0, utils_js_1.normalizeUrl)(value);
    return isHttpUrl(normalized) ? normalized : null;
}
const isValidDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const optionalString = (value, max, name) => {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'string')
        throw new Error(`"${name}" must be a string`);
    return value.length > max ? value.slice(0, max) : value;
};
const optionalBool = (value, name) => {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'boolean')
        throw new Error(`"${name}" must be true or false`);
    return value;
};
const optionalMediaUrl = (value, name) => {
    const text = optionalString(value, LIMITS.url, name);
    if (text === undefined || text === '')
        return text;
    if (!isHttpUrl(text))
        throw new Error(`"${name}" must be an http(s) URL`);
    return text;
};
function sanitizeReader(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'object' || Array.isArray(value))
        throw new Error('"readerContent" must be an object');
    const raw = value;
    const text = (key, max = LIMITS.readerText) => (typeof raw[key] === 'string' ? raw[key].slice(0, max) : undefined);
    const result = {
        title: text('title', LIMITS.title),
        byline: text('byline', LIMITS.title),
        content: text('content'),
        textContent: text('textContent'),
        excerpt: text('excerpt', LIMITS.description),
        siteName: text('siteName', LIMITS.title),
        length: typeof raw.length === 'number' && Number.isFinite(raw.length) ? raw.length : undefined
    };
    for (const key of Object.keys(result))
        if (result[key] === undefined)
            delete result[key];
    return result;
}
/**
 * Validates a bookmark body from the API. Unknown keys are dropped and
 * `undefined` fields are removed, so callers can safely spread the result.
 * With `partial`, the URL is optional (used by PUT).
 */
function sanitizeBookmarkInput(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return { ok: false, error: 'Request body must be a JSON object' };
    const raw = input;
    try {
        const out = {};
        if (raw.url !== undefined || !options.partial) {
            const url = toSafeBookmarkUrl(raw.url);
            if (!url)
                return { ok: false, error: raw.url === undefined ? 'Missing required field: "url"' : '"url" must be an http(s) URL' };
            out.url = url;
        }
        const set = (key, value) => { if (value !== undefined)
            out[key] = value; };
        set('id', optionalString(raw.id, LIMITS.id, 'id'));
        set('title', optionalString(raw.title, LIMITS.title, 'title'));
        set('description', optionalString(raw.description, LIMITS.description, 'description'));
        set('excerpt', optionalString(raw.excerpt, LIMITS.description, 'excerpt'));
        set('note', optionalString(raw.note, LIMITS.note, 'note'));
        set('domain', optionalString(raw.domain, LIMITS.domain, 'domain'));
        set('favicon', optionalMediaUrl(raw.favicon, 'favicon'));
        set('cover', optionalMediaUrl(raw.cover, 'cover'));
        set('collectionId', optionalString(raw.collectionId, LIMITS.id, 'collectionId'));
        set('isFavorite', optionalBool(raw.isFavorite, 'isFavorite'));
        set('isTrash', optionalBool(raw.isTrash, 'isTrash'));
        set('isDone', optionalBool(raw.isDone, 'isDone'));
        if (raw.tags !== undefined && raw.tags !== null) {
            if (!Array.isArray(raw.tags) || !raw.tags.every((tag) => typeof tag === 'string'))
                return { ok: false, error: '"tags" must be a list of strings' };
            out.tags = [...new Set(raw.tags.map((tag) => tag.trim().slice(0, LIMITS.tag)).filter(Boolean))].slice(0, LIMITS.tags);
        }
        if (raw.type !== undefined && raw.type !== null) {
            if (!BOOKMARK_TYPES.includes(raw.type))
                return { ok: false, error: '"type" is not a supported bookmark type' };
            out.type = raw.type;
        }
        if (raw.createdAt !== undefined && raw.createdAt !== null) {
            if (!isValidDate(raw.createdAt))
                return { ok: false, error: '"createdAt" must be an ISO date' };
            out.createdAt = raw.createdAt;
        }
        set('readerContent', sanitizeReader(raw.readerContent));
        return { ok: true, value: out };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Invalid bookmark' };
    }
}
function sanitizeCollectionInput(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return { ok: false, error: 'Request body must be a JSON object' };
    const raw = input;
    try {
        const out = {};
        const title = optionalString(raw.title, LIMITS.title, 'title')?.trim();
        if (!title && !options.partial)
            return { ok: false, error: 'Missing required field: "title"' };
        if (title)
            out.title = title;
        const set = (key, value) => { if (value !== undefined)
            out[key] = value; };
        set('id', optionalString(raw.id, LIMITS.id, 'id'));
        set('description', optionalString(raw.description, LIMITS.description, 'description'));
        set('icon', optionalString(raw.icon, 100, 'icon'));
        set('color', optionalString(raw.color, 50, 'color'));
        set('isSystem', optionalBool(raw.isSystem, 'isSystem'));
        if (raw.parentId !== undefined) {
            if (raw.parentId !== null && typeof raw.parentId !== 'string')
                return { ok: false, error: '"parentId" must be a string or null' };
            out.parentId = raw.parentId;
        }
        if (raw.sortOrder !== undefined && raw.sortOrder !== null) {
            if (typeof raw.sortOrder !== 'number' || !Number.isFinite(raw.sortOrder))
                return { ok: false, error: '"sortOrder" must be a number' };
            out.sortOrder = raw.sortOrder;
        }
        if (raw.defaultViewMode !== undefined && raw.defaultViewMode !== null) {
            if (!VIEW_MODES.includes(raw.defaultViewMode))
                return { ok: false, error: '"defaultViewMode" is not a supported view' };
            out.defaultViewMode = raw.defaultViewMode;
        }
        return { ok: true, value: out };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Invalid collection' };
    }
}
const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript):/i;
/**
 * Repairs or drops malformed records in a whole-store payload (sync, import,
 * a store file on disk) and clamps timestamps from clients with skewed
 * clocks. Returns null when the payload is not a store at all.
 */
function sanitizeStoreInput(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return null;
    const raw = input;
    if (raw.bookmarks !== undefined && !Array.isArray(raw.bookmarks))
        return null;
    if (raw.collections !== undefined && !Array.isArray(raw.collections))
        return null;
    if (raw.bookmarks === undefined && raw.collections === undefined)
        return null;
    const now = options.now ?? new Date();
    const nowIso = now.toISOString();
    const ceiling = now.getTime() + (options.maxFutureMs ?? 5 * 60 * 1000);
    const date = (value, fallback = nowIso) => {
        if (!isValidDate(value))
            return fallback;
        return Date.parse(value) > ceiling ? nowIso : new Date(value).toISOString();
    };
    const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
    const dropped = { bookmarks: 0, collections: 0, tombstones: 0, savedSearches: 0 };
    const bookmarks = [];
    for (const item of raw.bookmarks || []) {
        const b = item;
        const id = b && typeof b === 'object' ? str(b.id).slice(0, LIMITS.id) : '';
        const rawUrl = b && typeof b === 'object' ? b.url : undefined;
        const valid = id && typeof rawUrl === 'string' && rawUrl.trim() && (options.requireHttpUrls ? toSafeBookmarkUrl(rawUrl) : !DANGEROUS_SCHEME.test(rawUrl));
        if (!b || !valid) {
            dropped.bookmarks++;
            continue;
        }
        const url = options.requireHttpUrls ? toSafeBookmarkUrl(rawUrl) : rawUrl;
        const domain = str(b.domain) || (0, utils_js_1.extractDomain)(url);
        let reader;
        try {
            reader = sanitizeReader(b.readerContent);
        }
        catch {
            reader = undefined;
        }
        bookmarks.push({
            ...b,
            id,
            url,
            title: str(b.title) || domain,
            description: str(b.description),
            domain,
            collectionId: str(b.collectionId) || 'unsorted',
            tags: Array.isArray(b.tags) ? b.tags.filter((tag) => typeof tag === 'string') : [],
            isFavorite: b.isFavorite === true,
            isTrash: b.isTrash === true,
            type: BOOKMARK_TYPES.includes(b.type) ? b.type : 'link',
            createdAt: date(b.createdAt),
            updatedAt: date(b.updatedAt),
            readerContent: reader
        });
    }
    const collections = [];
    for (const item of raw.collections || []) {
        const c = item;
        if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id || typeof c.title !== 'string') {
            dropped.collections++;
            continue;
        }
        collections.push({
            ...c,
            id: c.id,
            title: c.title,
            sortOrder: typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder) ? c.sortOrder : 0,
            createdAt: date(c.createdAt),
            updatedAt: date(c.updatedAt)
        });
    }
    const tombstones = [];
    for (const item of Array.isArray(raw.tombstones) ? raw.tombstones : []) {
        const t = item;
        // Deleting a system collection must never propagate between devices.
        if (!t || typeof t.id !== 'string' || !t.id || (t.type !== 'bookmark' && t.type !== 'collection') || !isValidDate(t.deletedAt) || (t.type === 'collection' && exports.SYSTEM_COLLECTION_IDS.includes(t.id))) {
            dropped.tombstones++;
            continue;
        }
        tombstones.push({ id: t.id, type: t.type, deletedAt: date(t.deletedAt) });
    }
    const savedSearches = [];
    for (const item of Array.isArray(raw.savedSearches) ? raw.savedSearches : []) {
        const s = item;
        if (!s || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || typeof s.query !== 'string') {
            dropped.savedSearches++;
            continue;
        }
        savedSearches.push({ ...s, id: s.id, name: s.name, query: s.query, updatedAt: date(s.updatedAt), ...(isValidDate(s.deletedAt) ? { deletedAt: date(s.deletedAt) } : {}) });
    }
    return {
        store: {
            version: typeof raw.version === 'number' ? raw.version : 1,
            schemaVersion: 1,
            lastModified: date(raw.lastModified),
            deviceId: str(raw.deviceId, 'unknown').slice(0, LIMITS.id),
            bookmarks,
            collections,
            tombstones,
            savedSearches
        },
        dropped
    };
}
//# sourceMappingURL=validate.js.map