import { Bookmark, BookmarkType, Collection, KeepsakeDataStore, ReaderContent, SavedSearch, SyncTombstone, ViewMode } from './types.js';
import { extractDomain, normalizeUrl } from './utils.js';

/**
 * Input validation shared by the server routes, sync and import paths.
 * Nothing here trusts the shape of what clients send: wrong types are
 * rejected (single records) or dropped (whole-store payloads) instead of
 * being stored and breaking search or saves later.
 */

const BOOKMARK_TYPES: BookmarkType[] = ['link', 'article', 'image', 'video', 'document', 'audio'];
const VIEW_MODES: ViewMode[] = ['cards', 'list', 'headlines', 'moodboard'];
export const SYSTEM_COLLECTION_IDS = ['unsorted', 'all', 'trash', 'favorites'];

const LIMITS = { url: 4096, title: 1000, description: 10000, note: 100000, id: 200, domain: 253, tag: 100, tags: 100, readerText: 2_000_000 };

/** True for http(s) URLs only; javascript:, data:, file: and friends are rejected. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.url) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** href for a stored bookmark URL: the URL itself when it is a web link, otherwise an inert "#". */
export function safeHref(url: unknown): string {
  return isHttpUrl(url) ? url.trim() : '#';
}

/**
 * Settings for DOMPurify (client and server) when cleaning scraped article HTML.
 * HTML only (no SVG/MathML), no styles or form controls, no script or event handlers
 * (DOMPurify removes those itself), and only safe URL schemes.
 */
export const READER_PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'frame', 'object', 'embed', 'link', 'base', 'meta'],
  FORBID_ATTR: ['style', 'srcset', 'srcdoc', 'formaction', 'ping']
};

/** Normalizes a user-supplied link and returns it only if it is a safe web URL. */
export function toSafeBookmarkUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // normalizeUrl prefixes https:// to anything that does not start with http, so
  // an explicit other scheme (file:, javascript:, ftp:) has to be refused first.
  // "host:8080/path" is a host and port, not a scheme.
  const scheme = value.trim().match(/^([a-z][a-z0-9+.-]*):(?!\d+([/?#]|$))/i);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;
  const normalized = normalizeUrl(value);
  return isHttpUrl(normalized) ? normalized : null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type BookmarkInput = Partial<Omit<Bookmark, 'url'>> & { url?: string };

const isValidDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const optionalString = (value: unknown, max: number, name: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`"${name}" must be a string`);
  return value.length > max ? value.slice(0, max) : value;
};
const optionalBool = (value: unknown, name: string): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new Error(`"${name}" must be true or false`);
  return value;
};
const optionalMediaUrl = (value: unknown, name: string): string | undefined => {
  const text = optionalString(value, LIMITS.url, name);
  if (text === undefined || text === '') return text;
  if (!isHttpUrl(text)) throw new Error(`"${name}" must be an http(s) URL`);
  return text;
};

function sanitizeReader(value: unknown): ReaderContent | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('"readerContent" must be an object');
  const raw = value as Record<string, unknown>;
  const text = (key: string, max = LIMITS.readerText) => (typeof raw[key] === 'string' ? (raw[key] as string).slice(0, max) : undefined);
  const result: ReaderContent = {
    title: text('title', LIMITS.title),
    byline: text('byline', LIMITS.title),
    content: text('content'),
    textContent: text('textContent'),
    excerpt: text('excerpt', LIMITS.description),
    siteName: text('siteName', LIMITS.title),
    length: typeof raw.length === 'number' && Number.isFinite(raw.length) ? raw.length : undefined
  };
  for (const key of Object.keys(result) as (keyof ReaderContent)[]) if (result[key] === undefined) delete result[key];
  return result;
}

/**
 * Validates a bookmark body from the API. Unknown keys are dropped and
 * `undefined` fields are removed, so callers can safely spread the result.
 * With `partial`, the URL is optional (used by PUT).
 */
export function sanitizeBookmarkInput(input: unknown, options: { partial?: boolean } = {}): ValidationResult<BookmarkInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Request body must be a JSON object' };
  const raw = input as Record<string, unknown>;
  try {
    const out: BookmarkInput = {};
    if (raw.url !== undefined || !options.partial) {
      const url = toSafeBookmarkUrl(raw.url);
      if (!url) return { ok: false, error: raw.url === undefined ? 'Missing required field: "url"' : '"url" must be an http(s) URL' };
      out.url = url;
    }
    const set = <K extends keyof BookmarkInput>(key: K, value: BookmarkInput[K] | undefined) => { if (value !== undefined) out[key] = value; };
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
      if (!Array.isArray(raw.tags) || !raw.tags.every((tag) => typeof tag === 'string')) return { ok: false, error: '"tags" must be a list of strings' };
      out.tags = [...new Set(raw.tags.map((tag: string) => tag.trim().slice(0, LIMITS.tag)).filter(Boolean))].slice(0, LIMITS.tags);
    }
    if (raw.type !== undefined && raw.type !== null) {
      if (!BOOKMARK_TYPES.includes(raw.type as BookmarkType)) return { ok: false, error: '"type" is not a supported bookmark type' };
      out.type = raw.type as BookmarkType;
    }
    if (raw.createdAt !== undefined && raw.createdAt !== null) {
      if (!isValidDate(raw.createdAt)) return { ok: false, error: '"createdAt" must be an ISO date' };
      out.createdAt = raw.createdAt;
    }
    set('readerContent', sanitizeReader(raw.readerContent));
    return { ok: true, value: out };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid bookmark' };
  }
}

export type CollectionInput = Partial<Collection>;

export function sanitizeCollectionInput(input: unknown, options: { partial?: boolean } = {}): ValidationResult<CollectionInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Request body must be a JSON object' };
  const raw = input as Record<string, unknown>;
  try {
    const out: CollectionInput = {};
    const title = optionalString(raw.title, LIMITS.title, 'title')?.trim();
    if (!title && !options.partial) return { ok: false, error: 'Missing required field: "title"' };
    if (title) out.title = title;
    const set = <K extends keyof CollectionInput>(key: K, value: CollectionInput[K] | undefined) => { if (value !== undefined) out[key] = value; };
    set('id', optionalString(raw.id, LIMITS.id, 'id'));
    set('description', optionalString(raw.description, LIMITS.description, 'description'));
    set('icon', optionalString(raw.icon, 100, 'icon'));
    set('color', optionalString(raw.color, 50, 'color'));
    set('isSystem', optionalBool(raw.isSystem, 'isSystem'));
    if (raw.parentId !== undefined) {
      if (raw.parentId !== null && typeof raw.parentId !== 'string') return { ok: false, error: '"parentId" must be a string or null' };
      out.parentId = raw.parentId as string | null;
    }
    if (raw.sortOrder !== undefined && raw.sortOrder !== null) {
      if (typeof raw.sortOrder !== 'number' || !Number.isFinite(raw.sortOrder)) return { ok: false, error: '"sortOrder" must be a number' };
      out.sortOrder = raw.sortOrder;
    }
    if (raw.defaultViewMode !== undefined && raw.defaultViewMode !== null) {
      if (!VIEW_MODES.includes(raw.defaultViewMode as ViewMode)) return { ok: false, error: '"defaultViewMode" is not a supported view' };
      out.defaultViewMode = raw.defaultViewMode as ViewMode;
    }
    return { ok: true, value: out };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid collection' };
  }
}

export interface StoreSanitizeOptions {
  /** Clock used for defaults and the future-timestamp clamp. */
  now?: Date;
  /** Timestamps further than this ahead of `now` are clamped to `now`. Default 5 minutes. */
  maxFutureMs?: number;
  /** Also drop records whose URL is not http(s). Off when only repairing a stored file. */
  requireHttpUrls?: boolean;
}

export interface StoreSanitizeResult {
  store: KeepsakeDataStore;
  dropped: { bookmarks: number; collections: number; tombstones: number; savedSearches: number };
}

const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript):/i;

/**
 * Repairs or drops malformed records in a whole-store payload (sync, import,
 * a store file on disk) and clamps timestamps from clients with skewed
 * clocks. Returns null when the payload is not a store at all.
 */
export function sanitizeStoreInput(input: unknown, options: StoreSanitizeOptions = {}): StoreSanitizeResult | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (raw.bookmarks !== undefined && !Array.isArray(raw.bookmarks)) return null;
  if (raw.collections !== undefined && !Array.isArray(raw.collections)) return null;
  if (raw.bookmarks === undefined && raw.collections === undefined) return null;

  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const ceiling = now.getTime() + (options.maxFutureMs ?? 5 * 60 * 1000);
  const date = (value: unknown, fallback = nowIso): string => {
    if (!isValidDate(value)) return fallback;
    return Date.parse(value) > ceiling ? nowIso : new Date(value).toISOString();
  };
  const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
  const dropped = { bookmarks: 0, collections: 0, tombstones: 0, savedSearches: 0 };

  const bookmarks: Bookmark[] = [];
  for (const item of (raw.bookmarks as unknown[]) || []) {
    const b = item as Record<string, unknown> | null;
    const id = b && typeof b === 'object' ? str(b.id).slice(0, LIMITS.id) : '';
    const rawUrl = b && typeof b === 'object' ? b.url : undefined;
    const valid = id && typeof rawUrl === 'string' && rawUrl.trim() && (options.requireHttpUrls ? toSafeBookmarkUrl(rawUrl) : !DANGEROUS_SCHEME.test(rawUrl));
    if (!b || !valid) { dropped.bookmarks++; continue; }
    const url = options.requireHttpUrls ? toSafeBookmarkUrl(rawUrl)! : (rawUrl as string);
    const domain = str(b.domain) || extractDomain(url);
    let reader: ReaderContent | undefined;
    try { reader = sanitizeReader(b.readerContent); } catch { reader = undefined; }
    bookmarks.push({
      ...(b as unknown as Bookmark),
      id,
      url,
      title: str(b.title) || domain,
      description: str(b.description),
      domain,
      collectionId: str(b.collectionId) || 'unsorted',
      tags: Array.isArray(b.tags) ? b.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      isFavorite: b.isFavorite === true,
      isTrash: b.isTrash === true,
      type: BOOKMARK_TYPES.includes(b.type as BookmarkType) ? (b.type as BookmarkType) : 'link',
      createdAt: date(b.createdAt),
      updatedAt: date(b.updatedAt),
      readerContent: reader
    });
  }

  const collections: Collection[] = [];
  for (const item of (raw.collections as unknown[]) || []) {
    const c = item as Record<string, unknown> | null;
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id || typeof c.title !== 'string') { dropped.collections++; continue; }
    collections.push({
      ...(c as unknown as Collection),
      id: c.id,
      title: c.title,
      sortOrder: typeof c.sortOrder === 'number' && Number.isFinite(c.sortOrder) ? c.sortOrder : 0,
      createdAt: date(c.createdAt),
      updatedAt: date(c.updatedAt)
    });
  }

  const tombstones: SyncTombstone[] = [];
  for (const item of Array.isArray(raw.tombstones) ? raw.tombstones : []) {
    const t = item as Record<string, unknown> | null;
    // Deleting a system collection must never propagate between devices.
    if (!t || typeof t.id !== 'string' || !t.id || (t.type !== 'bookmark' && t.type !== 'collection') || !isValidDate(t.deletedAt) || (t.type === 'collection' && SYSTEM_COLLECTION_IDS.includes(t.id))) { dropped.tombstones++; continue; }
    tombstones.push({ id: t.id, type: t.type, deletedAt: date(t.deletedAt) });
  }

  const savedSearches: SavedSearch[] = [];
  for (const item of Array.isArray(raw.savedSearches) ? raw.savedSearches : []) {
    const s = item as Record<string, unknown> | null;
    if (!s || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || typeof s.query !== 'string') { dropped.savedSearches++; continue; }
    savedSearches.push({ ...(s as unknown as SavedSearch), id: s.id, name: s.name, query: s.query, updatedAt: date(s.updatedAt), ...(isValidDate(s.deletedAt) ? { deletedAt: date(s.deletedAt) } : {}) });
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
