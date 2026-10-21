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
//# sourceMappingURL=utils.d.ts.map