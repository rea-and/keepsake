import { Bookmark, ParsedSearchQuery } from './types.js';
/**
 * Parses search strings with advanced syntax support:
 * - tag:developer or #developer
 * - site:github.com or domain:github.com
 * - is:favorite or is:starred
 * - type:article (link, article, image, video, document, audio)
 * - has:note
 * - regular keywords
 */
export declare function parseSearchQuery(query: string): ParsedSearchQuery;
/**
 * Filters a bookmark against parsed search criteria
 */
export declare function matchesSearch(bookmark: Bookmark, parsed: ParsedSearchQuery): boolean;
//# sourceMappingURL=search.d.ts.map