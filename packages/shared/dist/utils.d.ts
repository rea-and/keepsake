import { Bookmark, Collection } from './types.js';
/**
 * Normalizes a URL by removing common tracking parameters and canonicalizing protocol
 */
export declare function normalizeUrl(rawUrl: string): string;
/**
 * Extracts a clean domain name from a URL
 */
export declare function extractDomain(urlStr: string): string;
/**
 * Generates a high-resolution favicon URL for a given domain
 */
export declare function getFaviconUrl(domainOrUrl: string, size?: number): string;
/**
 * Extracts YouTube video ID from various YouTube URL formats
 * (watch?v=, youtu.be/, shorts/, embed/, live/)
 */
export declare function getYouTubeVideoId(rawUrl: string): string | null;
/**
 * Generates a high-definition video thumbnail URL for YouTube videos
 */
export declare function getYouTubeThumbnail(rawUrl: string): string | null;
export interface RedditPostInfo {
    subreddit?: string;
    postId?: string;
    slug?: string;
}
/**
 * Parses Reddit URLs to extract post ID and subreddit
 */
export declare function parseRedditUrl(rawUrl: string): RedditPostInfo | null;
export declare function isRedditUrl(rawUrl: string): boolean;
/**
 * Strips redundant Reddit suffixes like ": r/subreddit" or "- Reddit" from page titles
 */
export declare function cleanRedditTitle(rawTitle: string): string;
/**
 * Checks whether a bookmark title is sparse or generic (e.g. matching url, domain, or placeholder)
 */
export declare function isSparseTitle(title?: string | null, domain?: string, url?: string): boolean;
/**
 * Normalizes and cleans Reddit media URLs, stripping double-encoded entities and
 * upgrading preview.redd.it links to permanent, high-res direct i.redd.it URLs.
 */
export declare function cleanRedditMediaUrl(rawUrl?: string | null): string | undefined;
/**
 * Checks if a Reddit image URL is a generic placeholder, icon, or share tracker
 */
export declare function isGenericRedditMedia(url?: string | null): boolean;
/**
 * Checks if a given URL is a valid, displayable media/image link (and not a webpage or video stream)
 */
export declare function isValidMediaUrl(url?: string | null): boolean;
/**
 * Exports bookmarks to Netscape Bookmark HTML format (standard supported by Chrome, Firefox, Safari, Raindrop)
 */
export declare function exportToNetscapeHtml(bookmarks: Bookmark[], collections: Collection[]): string;
/**
 * Basic parser for Netscape HTML bookmark format
 */
export declare function parseNetscapeHtml(html: string): Array<{
    url: string;
    title: string;
    collectionName?: string;
    tags?: string[];
    description?: string;
    createdAt?: string;
}>;
/**
 * Converts a string into a clean, URL-friendly slug.
 * Handles diacritics, symbols, spaces, and repeated dashes.
 * Example: "Mac App" -> "mac-app"
 */
export declare function slugify(text: string): string;
/**
 * Returns the URL slug for a collection / category.
 * If the collection has a custom slug, it uses that.
 * Otherwise, it generates a clean slug from the title.
 * Specially maps "Mac App" -> "mac-apps" as requested.
 */
export declare function getCollectionSlug(collection: {
    id: string;
    title: string;
    slug?: string;
}): string;
/**
 * Returns the full web path for a collection (with trailing slash).
 * Examples:
 * - "all" -> "/"
 * - "unsorted" -> "/unsorted/"
 * - "favorites" -> "/favorites/"
 * - "trash" -> "/trash/"
 * - "Mac App" -> "/mac-apps/"
 */
export declare function getCollectionPath(collectionOrId: Collection | string): string;
/**
 * Resolves a URL path or slug back to a collection or system collection ID.
 * Supports:
 * - Direct ID match
 * - Slug match ("mac-apps")
 * - Singular / Plural flexibility ("mac-apps" <-> "Mac App")
 * - Case-insensitive and punctuation-tolerant matching
 */
export declare function findCollectionBySlug(collections: Collection[], rawPath: string): Collection | 'all' | 'unsorted' | 'favorites' | 'trash' | null;
export interface DragDataTransferLike {
    getData: (format: string) => string;
    types?: readonly string[] | string[];
    files?: FileList | File[] | readonly File[];
    items?: DataTransferItemList | any[] | readonly any[];
}
export interface ExtractedBookmark {
    url: string;
    title?: string;
    collectionName?: string;
}
/**
 * Extracts all valid HTTP/HTTPS bookmarks from a browser drag-and-drop event.
 * Handles:
 * - Single bookmarks dragged from Chrome tab, URL bar, or bookmark bar.
 * - Entire bookmark folders or multi-selected bookmarks dragged from Chrome bookmark bar / manager.
 * - Dropped bookmark HTML export files (Netscape bookmark format).
 * - Dropped folders or .webloc / .url files.
 * Automatically ignores internal Keepsake bookmark dragging.
 */
export declare function extractBookmarksFromDataTransfer(dt: DragDataTransferLike): Promise<ExtractedBookmark[]>;
/**
 * Extracts a single valid HTTP/HTTPS URL and optional title from a browser drag-and-drop event.
 * Synchronous helper for backward compatibility.
 */
export declare function extractUrlFromDataTransfer(dt: DragDataTransferLike): {
    url: string;
    title?: string;
} | null;
//# sourceMappingURL=utils.d.ts.map