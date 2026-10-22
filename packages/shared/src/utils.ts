import { Bookmark, Collection } from './types.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'ref',
  'ref_src',
  'source'
]);

/**
 * Normalizes a URL by removing common tracking parameters and canonicalizing protocol
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);

    // Remove tracking query parameters
    const keysToRemove: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.startsWith('utm_')) {
        keysToRemove.push(key);
      }
    });
    for (const key of keysToRemove) {
      url.searchParams.delete(key);
    }

    // Strip trailing slash if pathname is just '/'
    let clean = url.toString();
    if (clean.endsWith('/') && url.pathname === '/') {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Extracts a clean domain name from a URL
 */
export function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

/**
 * Generates a high-resolution favicon URL for a given domain
 */
export function getFaviconUrl(domainOrUrl: string, size = 64): string {
  const domain = extractDomain(domainOrUrl);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Extracts YouTube video ID from various YouTube URL formats
 * (watch?v=, youtu.be/, shorts/, embed/, live/)
 */
export function getYouTubeVideoId(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0].split('?')[0];
      return id && id.length >= 5 ? id : null;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      if (url.searchParams.has('v')) {
        const id = url.searchParams.get('v');
        return id && id.length >= 5 ? id : null;
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'v', 'live'].includes(parts[0]) && parts[1]) {
        return parts[1].split('?')[0];
      }
    }
  } catch {}
  return null;
}

/**
 * Generates a high-definition video thumbnail URL for YouTube videos
 */
export function getYouTubeThumbnail(rawUrl: string): string | null {
  const videoId = getYouTubeVideoId(rawUrl);
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export interface RedditPostInfo {
  subreddit?: string;
  postId?: string;
  slug?: string;
}

/**
 * Parses Reddit URLs to extract post ID and subreddit
 */
export function parseRedditUrl(rawUrl: string): RedditPostInfo | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'redd.it') {
      const postId = url.pathname.slice(1).split('/')[0];
      return postId ? { postId } : null;
    }

    if (
      ['reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com', 'm.reddit.com'].includes(host) ||
      host.endsWith('.reddit.com')
    ) {
      // 1. /r/subreddit/comments/postId/...
      const match = url.pathname.match(/\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9]+)(?:\/([^\/]+))?/i);
      if (match) {
        return {
          subreddit: match[1],
          postId: match[2],
          slug: match[3]
        };
      }
      // 2. /comments/postId/...
      const directCommentsMatch = url.pathname.match(/\/comments\/([a-zA-Z0-9]+)(?:\/([^\/]+))?/i);
      if (directCommentsMatch) {
        return {
          postId: directCommentsMatch[1],
          slug: directCommentsMatch[2]
        };
      }
      // 3. /gallery/postId/...
      const galleryMatch = url.pathname.match(/\/gallery\/([a-zA-Z0-9]+)/i);
      if (galleryMatch) {
        return {
          postId: galleryMatch[1]
        };
      }
      // 4. /r/subreddit/s/shortcode (Reddit mobile share links)
      const shortMatch = url.pathname.match(/\/r\/([a-zA-Z0-9_]+)\/s\/([a-zA-Z0-9]+)/i);
      if (shortMatch) {
        return {
          subreddit: shortMatch[1]
        };
      }
      // 5. /s/shortcode
      const directShortMatch = url.pathname.match(/\/s\/([a-zA-Z0-9]+)/i);
      if (directShortMatch) {
        return {};
      }
      // Subreddit homepage e.g. /r/technology
      const subMatch = url.pathname.match(/\/r\/([a-zA-Z0-9_]+)\/?$/i);
      if (subMatch) {
        return {
          subreddit: subMatch[1]
        };
      }
      return {};
    }
  } catch {}
  return null;
}

export function isRedditUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'redd.it' || host === 'reddit.com' || host.endsWith('.reddit.com');
  } catch {
    return false;
  }
}

/**
 * Strips redundant Reddit suffixes like ": r/subreddit" or "- Reddit" from page titles
 */
export function cleanRedditTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/^From the [^:]+ community on Reddit:\s*/i, '')
    .replace(/^From the [^:]+ on Reddit:\s*/i, '')
    .replace(/\s*:\s*r\/[a-zA-Z0-9_]+.*$/i, '')
    .replace(/\s*[-–—]\s*r\/[a-zA-Z0-9_]+.*$/i, '')
    .replace(/\s*[-–—]\s*Reddit.*$/i, '')
    .replace(/\s*:\s*Reddit.*$/i, '')
    .trim();
}

/**
 * Checks whether a bookmark title is sparse or generic (e.g. matching url, domain, or placeholder)
 */
export function isSparseTitle(title?: string | null, domain?: string, url?: string): boolean {
  if (!title || !title.trim()) return true;
  const clean = title.trim().toLowerCase();
  if (url && clean === url.trim().toLowerCase()) return true;
  if (domain && clean === domain.trim().toLowerCase().replace(/^www\./, '')) return true;

  if (
    clean === 'reddit' ||
    clean === 'reddit.com' ||
    clean === 'redd.it' ||
    clean.startsWith('reddit:') ||
    clean === 'reddit - dive into anything' ||
    clean === 'the heart of the internet' ||
    clean === 'the front page of the internet'
  ) {
    return true;
  }

  if (clean === 'youtube' || clean === 'youtube.com') {
    return true;
  }

  return false;
}

/**
 * Checks if a Reddit image URL is a generic placeholder, icon, or share tracker
 */
export function isGenericRedditMedia(url?: string | null): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('redditstatic.com') ||
    lower.includes('icon.png') ||
    lower.includes('favicon') ||
    lower.includes('default_to_') ||
    lower.includes('share.redd.it')
  );
}

/**
 * Checks if a given URL is a valid, displayable media/image link (and not a webpage or video stream)
 */
export function isValidMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (isGenericRedditMedia(clean)) return false;
  if (clean.includes('v.redd.it')) return false;

  // Real Reddit CDN image domains
  if (
    clean.includes('i.redd.it') ||
    clean.includes('preview.redd.it') ||
    clean.includes('external-preview.redd.it') ||
    clean.includes('thumbs.redditmedia.com') ||
    clean.includes('i.imgur.com')
  ) {
    return true;
  }

  // Standard image extensions (excluding web pages)
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Exports bookmarks to Netscape Bookmark HTML format (standard supported by Chrome, Firefox, Safari, Raindrop)
 */
export function exportToNetscapeHtml(bookmarks: Bookmark[], collections: Collection[]): string {
  const collectionMap = new Map<string, Collection>();
  collections.forEach((c) => collectionMap.set(c.id, c));

  // Group bookmarks by collection
  const grouped = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    if (b.isTrash) continue;
    const colId = b.collectionId || 'unsorted';
    if (!grouped.has(colId)) {
      grouped.set(colId, []);
    }
    grouped.get(colId)!.push(b);
  }

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Keepsake Bookmarks</H1>
<DL><p>
`;

  // Render collections
  for (const [colId, items] of grouped.entries()) {
    const colName = collectionMap.get(colId)?.title || (colId === 'unsorted' ? 'Unsorted' : 'Collection');
    html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}" LAST_MODIFIED="${Math.floor(Date.now() / 1000)}">${escapeHtml(colName)}</H3>\n    <DL><p>\n`;

    for (const b of items) {
      const addDate = Math.floor(new Date(b.createdAt).getTime() / 1000);
      const tagsAttr = b.tags.length > 0 ? ` TAGS="${escapeHtml(b.tags.join(','))}"` : '';
      const iconAttr = b.favicon ? ` ICON="${escapeHtml(b.favicon)}"` : '';
      html += `        <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${addDate}"${tagsAttr}${iconAttr}>${escapeHtml(b.title || b.url)}</A>\n`;
      if (b.description || b.note) {
        const desc = [b.description, b.note].filter(Boolean).join('\n---\n');
        html += `        <DD>${escapeHtml(desc)}\n`;
      }
    }

    html += `    </DL><p>\n`;
  }

  html += `</DL><p>\n`;
  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Basic parser for Netscape HTML bookmark format
 */
export function parseNetscapeHtml(html: string): Array<{
  url: string;
  title: string;
  collectionName?: string;
  tags?: string[];
  description?: string;
  createdAt?: string;
}> {
  const results: Array<{
    url: string;
    title: string;
    collectionName?: string;
    tags?: string[];
    description?: string;
    createdAt?: string;
  }> = [];

  // Match A tags with HREF, ADD_DATE, TAGS
  const linkRegex = /<A\s+([^>]*?)>(.*?)<\/A>(?:[\s\n]*<DD>(.*?)(?=<DT|<DL|<\/DL|$))?/gi;
  let currentFolder = 'Unsorted';

  // Find folders: <H3>FolderName</H3>
  const tokens = html.split(/(<H3[^>]*>.*?<\/H3>|<DL>|<\/DL>)/i);
  const folderStack: string[] = ['Unsorted'];

  for (const part of tokens) {
    const h3Match = part.match(/<H3[^>]*>(.*?)<\/H3>/i);
    if (h3Match) {
      currentFolder = h3Match[1].replace(/<[^>]+>/g, '').trim();
      folderStack.push(currentFolder);
    } else if (part.toUpperCase().startsWith('</DL>')) {
      if (folderStack.length > 1) folderStack.pop();
      currentFolder = folderStack[folderStack.length - 1];
    }

    let match;
    while ((match = linkRegex.exec(part)) !== null) {
      const attrsStr = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const ddContent = match[3] ? match[3].replace(/<[^>]+>/g, '').trim() : '';

      const hrefMatch = attrsStr.match(/HREF="([^"]*)"/i);
      if (!hrefMatch) continue;
      const url = hrefMatch[1];

      const tagsMatch = attrsStr.match(/TAGS="([^"]*)"/i);
      const tags = tagsMatch ? tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean) : [];

      const dateMatch = attrsStr.match(/ADD_DATE="([^"]*)"/i);
      let createdAt: string | undefined;
      if (dateMatch) {
        const secs = parseInt(dateMatch[1], 10);
        if (!isNaN(secs)) {
          createdAt = new Date(secs * 1000).toISOString();
        }
      }

      results.push({
        url,
        title: title || url,
        collectionName: currentFolder,
        tags,
        description: ddContent,
        createdAt
      });
    }
  }

  return results;
}
