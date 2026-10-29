import { Bookmark, ParsedSearchQuery, BookmarkType } from './types.js';

/**
 * Parses search strings with advanced syntax support:
 * - tag:developer or #developer
 * - site:github.com or domain:github.com
 * - is:favorite or is:starred
 * - type:article (link, article, image, video, document, audio)
 * - has:note
 * - regular keywords
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    text: '',
    tags: []
  };

  if (!query || !query.trim()) {
    return result;
  }

  const tokens = query.trim().split(/\s+/);
  const textWords: string[] = [];

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
      if (tagVal) result.tags.push(tagVal);
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

    // Check for is:done or is:pending
    if (lowerToken === 'is:done' || lowerToken === 'done:true') {
      result.isDone = true;
      continue;
    }
    if (lowerToken === 'is:pending' || lowerToken === 'is:todo' || lowerToken === 'done:false') {
      result.isDone = false;
      continue;
    }

    // Check for has:note
    if (lowerToken === 'has:note') {
      result.hasNote = true;
      continue;
    }

    // Check for type:article etc
    if (lowerToken.startsWith('type:')) {
      const typeVal = lowerToken.slice(5) as BookmarkType;
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
export function matchesSearch(bookmark: Bookmark, parsed: ParsedSearchQuery): boolean {
  // Filter favorite
  if (parsed.isFavorite !== undefined && bookmark.isFavorite !== parsed.isFavorite) {
    return false;
  }

  // Filter done / pending status
  if (parsed.isDone !== undefined && Boolean(bookmark.isDone) !== parsed.isDone) {
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
