"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSearchQuery = parseSearchQuery;
exports.matchesSearch = matchesSearch;
/**
 * Parses search strings with advanced syntax support:
 * - tag:developer or #developer
 * - site:github.com or domain:github.com
 * - is:favorite or is:starred
 * - type:article (link, article, image, video, document, audio)
 * - has:note
 * - regular keywords
 */
function parseSearchQuery(query) {
    const result = {
        text: '',
        tags: []
    };
    if (!query || !query.trim()) {
        return result;
    }
    const tokens = query.trim().split(/\s+/);
    const textWords = [];
    for (const token of tokens) {
        const lowerToken = token.toLowerCase();
        // Check for #tag
        if (token.startsWith('#') && token.length > 1) {
            result.tags.push(token.slice(1));
            continue;
        }
        // Check for tag:name
        if (lowerToken.startsWith('tag:')) {
            const tagVal = token.slice(4);
            if (tagVal)
                result.tags.push(tagVal);
            continue;
        }
        // Check for site:domain or domain:domain
        if (lowerToken.startsWith('site:')) {
            result.domain = token.slice(5).toLowerCase();
            continue;
        }
        if (lowerToken.startsWith('domain:')) {
            result.domain = token.slice(7).toLowerCase();
            continue;
        }
        // Check for is:favorite or is:starred
        if (lowerToken === 'is:favorite' || lowerToken === 'is:starred' || lowerToken === 'favorite:true') {
            result.isFavorite = true;
            continue;
        }
        // Check for has:note
        if (lowerToken === 'has:note') {
            result.hasNote = true;
            continue;
        }
        // Check for type:article etc
        if (lowerToken.startsWith('type:')) {
            const typeVal = lowerToken.slice(5);
            if (['link', 'article', 'image', 'video', 'document', 'audio'].includes(typeVal)) {
                result.type = typeVal;
                continue;
            }
        }
        // Check for in:collectionId
        if (lowerToken.startsWith('in:')) {
            result.collectionId = token.slice(3);
            continue;
        }
        // Standard word
        textWords.push(token);
    }
    result.text = textWords.join(' ').toLowerCase();
    return result;
}
/**
 * Filters a bookmark against parsed search criteria
 */
function matchesSearch(bookmark, parsed) {
    // Filter favorite
    if (parsed.isFavorite !== undefined && bookmark.isFavorite !== parsed.isFavorite) {
        return false;
    }
    // Filter type
    if (parsed.type && bookmark.type !== parsed.type) {
        return false;
    }
    // Filter hasNote
    if (parsed.hasNote && (!bookmark.note || !bookmark.note.trim())) {
        return false;
    }
    // Filter domain
    if (parsed.domain) {
        if (!bookmark.domain.toLowerCase().includes(parsed.domain)) {
            return false;
        }
    }
    // Filter collection
    if (parsed.collectionId && bookmark.collectionId !== parsed.collectionId) {
        return false;
    }
    // Filter tags (must match all specified tags)
    if (parsed.tags.length > 0) {
        const bookmarkTagsLower = bookmark.tags.map((t) => t.toLowerCase());
        for (const tag of parsed.tags) {
            const tagLower = tag.toLowerCase();
            if (!bookmarkTagsLower.some((t) => t.includes(tagLower))) {
                return false;
            }
        }
    }
    // Filter free text
    if (parsed.text) {
        const searchTerms = parsed.text.split(' ').filter(Boolean);
        const searchableContent = [
            bookmark.title,
            bookmark.description,
            bookmark.domain,
            bookmark.url,
            bookmark.note || '',
            ...bookmark.tags
        ].join(' ').toLowerCase();
        for (const term of searchTerms) {
            if (!searchableContent.includes(term)) {
                return false;
            }
        }
    }
    return true;
}
//# sourceMappingURL=search.js.map