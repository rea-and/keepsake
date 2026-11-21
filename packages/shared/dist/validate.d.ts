import { Bookmark, Collection, KeepsakeDataStore } from './types.js';
export declare const SYSTEM_COLLECTION_IDS: string[];
/** True for http(s) URLs only; javascript:, data:, file: and friends are rejected. */
export declare function isHttpUrl(value: unknown): value is string;
/** href for a stored bookmark URL: the URL itself when it is a web link, otherwise an inert "#". */
export declare function safeHref(url: unknown): string;
/**
 * Settings for DOMPurify (client and server) when cleaning scraped article HTML.
 * HTML only (no SVG/MathML), no styles or form controls, no script or event handlers
 * (DOMPurify removes those itself), and only safe URL schemes.
 */
export declare const READER_PURIFY_CONFIG: {
    USE_PROFILES: {
        html: boolean;
    };
    FORBID_TAGS: string[];
    FORBID_ATTR: string[];
};
/** Normalizes a user-supplied link and returns it only if it is a safe web URL. */
export declare function toSafeBookmarkUrl(value: unknown): string | null;
export type ValidationResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
};
export type BookmarkInput = Partial<Omit<Bookmark, 'url'>> & {
    url?: string;
};
/**
 * Validates a bookmark body from the API. Unknown keys are dropped and
 * `undefined` fields are removed, so callers can safely spread the result.
 * With `partial`, the URL is optional (used by PUT).
 */
export declare function sanitizeBookmarkInput(input: unknown, options?: {
    partial?: boolean;
}): ValidationResult<BookmarkInput>;
export type CollectionInput = Partial<Collection>;
export declare function sanitizeCollectionInput(input: unknown, options?: {
    partial?: boolean;
}): ValidationResult<CollectionInput>;
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
    dropped: {
        bookmarks: number;
        collections: number;
        tombstones: number;
        savedSearches: number;
    };
}
/**
 * Repairs or drops malformed records in a whole-store payload (sync, import,
 * a store file on disk) and clamps timestamps from clients with skewed
 * clocks. Returns null when the payload is not a store at all.
 */
export declare function sanitizeStoreInput(input: unknown, options?: StoreSanitizeOptions): StoreSanitizeResult | null;
//# sourceMappingURL=validate.d.ts.map