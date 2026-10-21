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