"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUrl = normalizeUrl;
exports.extractDomain = extractDomain;
exports.getFaviconUrl = getFaviconUrl;
exports.getYouTubeVideoId = getYouTubeVideoId;
exports.getYouTubeThumbnail = getYouTubeThumbnail;
exports.parseRedditUrl = parseRedditUrl;
exports.isRedditUrl = isRedditUrl;
exports.cleanRedditTitle = cleanRedditTitle;
exports.isSparseTitle = isSparseTitle;
exports.cleanRedditMediaUrl = cleanRedditMediaUrl;
exports.isGenericRedditMedia = isGenericRedditMedia;
exports.isValidMediaUrl = isValidMediaUrl;
exports.exportToNetscapeHtml = exportToNetscapeHtml;
exports.parseNetscapeHtml = parseNetscapeHtml;
exports.slugify = slugify;
exports.getCollectionSlug = getCollectionSlug;
exports.getCollectionPath = getCollectionPath;
exports.findCollectionBySlug = findCollectionBySlug;
exports.extractBookmarksFromDataTransfer = extractBookmarksFromDataTransfer;
exports.extractUrlFromDataTransfer = extractUrlFromDataTransfer;
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
function normalizeUrl(rawUrl) {
    try {
        const trimmed = rawUrl.trim();
        const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        // Remove tracking query parameters
        const keysToRemove = [];
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
    }
    catch {
        return rawUrl.trim();
    }
}
/**
 * Extracts a clean domain name from a URL
 */
function extractDomain(urlStr) {
    try {
        const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
        return parsed.hostname.replace(/^www\./, '');
    }
    catch {
        return 'link';
    }
}
/**
 * Generates a high-resolution favicon URL for a given domain
 */
function getFaviconUrl(domainOrUrl, size = 64) {
    const domain = extractDomain(domainOrUrl);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
/**
 * Extracts YouTube video ID from various YouTube URL formats
 * (watch?v=, youtu.be/, shorts/, embed/, live/)
 */
function getYouTubeVideoId(rawUrl) {
    if (!rawUrl)
        return null;
    try {
        const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'youtu.be') {
            const id = url.pathname.slice(1).split('/')[0].split('?')[0];
            return id && id.length >= 5 ? id : null;
        }
        if (host === 'youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'music.youtube.com' ||
            host === 'youtube-nocookie.com') {
            if (url.searchParams.has('v')) {
                const id = url.searchParams.get('v');
                return id && id.length >= 5 ? id : null;
            }
            const parts = url.pathname.split('/').filter(Boolean);
            if (['shorts', 'embed', 'v', 'live'].includes(parts[0]) && parts[1]) {
                return parts[1].split('?')[0];
            }
        }
    }
    catch { }
    return null;
}
/**
 * Generates a high-definition video thumbnail URL for YouTube videos
 */
function getYouTubeThumbnail(rawUrl) {
    const videoId = getYouTubeVideoId(rawUrl);
    if (!videoId)
        return null;
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
/**
 * Parses Reddit URLs to extract post ID and subreddit
 */
function parseRedditUrl(rawUrl) {
    if (!rawUrl)
        return null;
    try {
        const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'redd.it') {
            const postId = url.pathname.slice(1).split('/')[0];
            return postId ? { postId } : null;
        }
        if (['reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com', 'm.reddit.com'].includes(host) ||
            host.endsWith('.reddit.com')) {
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
    }
    catch { }
    return null;
}
function isRedditUrl(rawUrl) {
    if (!rawUrl)
        return false;
    try {
        const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        return host === 'redd.it' || host === 'reddit.com' || host.endsWith('.reddit.com');
    }
    catch {
        return false;
    }
}
/**
 * Strips redundant Reddit suffixes like ": r/subreddit" or "- Reddit" from page titles
 */
function cleanRedditTitle(rawTitle) {
    if (!rawTitle)
        return '';
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
function isSparseTitle(title, domain, url) {
    if (!title || !title.trim())
        return true;
    const clean = title.trim().toLowerCase();
    if (url && clean === url.trim().toLowerCase())
        return true;
    if (domain && clean === domain.trim().toLowerCase().replace(/^www\./, ''))
        return true;
    if (clean === 'reddit' ||
        clean === 'reddit.com' ||
        clean === 'redd.it' ||
        clean.startsWith('reddit:') ||
        clean === 'reddit - dive into anything' ||
        clean === 'the heart of the internet' ||
        clean === 'the front page of the internet') {
        return true;
    }
    if (clean === 'youtube' || clean === 'youtube.com') {
        return true;
    }
    return false;
}
/**
 * Normalizes and cleans Reddit media URLs, stripping double-encoded entities and
 * upgrading preview.redd.it links to permanent, high-res direct i.redd.it URLs.
 */
function cleanRedditMediaUrl(rawUrl) {
    if (!rawUrl)
        return undefined;
    let url = rawUrl.trim();
    url = url.replace(/&quot;.*$/, '');
    url = url.replace(/&gt;.*$/, '');
    url = url.replace(/['"]+$/, '');
    while (url.includes('&amp;')) {
        url = url.replace(/&amp;/g, '&');
    }
    // Handle Reddit wrapper: /media?url=...
    if (url.includes('/media?') || url.includes('/media/')) {
        try {
            const match = url.match(/[?&]url=([^&]+)/);
            if (match) {
                url = decodeURIComponent(match[1]);
                while (url.includes('&amp;')) {
                    url = url.replace(/&amp;/g, '&');
                }
            }
        }
        catch { }
    }
    // Convert preview.redd.it to direct permanent i.redd.it link
    const extMatch = url.match(/https:\/\/preview\.redd\.it\/([a-zA-Z0-9_\-\.]+)\.(jpe?g|png|webp|gif)/i);
    if (extMatch) {
        return `https://i.redd.it/${extMatch[1]}.${extMatch[2]}`;
    }
    const noExtMatch = url.match(/https:\/\/preview\.redd\.it\/([a-zA-Z0-9_\-]+)\?(?:[^"'\s]*&)?format=(p?jpe?g|png|webp|gif)/i);
    if (noExtMatch) {
        const ext = noExtMatch[2].toLowerCase() === 'pjpg' ? 'jpg' : noExtMatch[2].toLowerCase();
        return `https://i.redd.it/${noExtMatch[1]}.${ext}`;
    }
    if (isGenericRedditMedia(url)) {
        return undefined;
    }
    return url;
}
/**
 * Checks if a Reddit image URL is a generic placeholder, icon, or share tracker
 */
function isGenericRedditMedia(url) {
    if (!url)
        return true;
    const lower = url.toLowerCase();
    return (lower.includes('redditstatic.com') ||
        lower.includes('icon.png') ||
        lower.includes('favicon') ||
        lower.includes('default_to_') ||
        lower.includes('share.redd.it'));
}
/**
 * Checks if a given URL is a valid, displayable media/image link (and not a webpage or video stream)
 */
function isValidMediaUrl(url) {
    if (!url)
        return false;
    const clean = url.trim().toLowerCase();
    if (isGenericRedditMedia(clean))
        return false;
    if (clean.includes('v.redd.it'))
        return false;
    // Real Reddit CDN image domains
    if (clean.includes('i.redd.it') ||
        clean.includes('preview.redd.it') ||
        clean.includes('external-preview.redd.it') ||
        clean.includes('thumbs.redditmedia.com') ||
        clean.includes('i.imgur.com')) {
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
function exportToNetscapeHtml(bookmarks, collections) {
    const collectionMap = new Map();
    collections.forEach((c) => collectionMap.set(c.id, c));
    // Group bookmarks by collection
    const grouped = new Map();
    for (const b of bookmarks) {
        if (b.isTrash)
            continue;
        const colId = b.collectionId || 'unsorted';
        if (!grouped.has(colId)) {
            grouped.set(colId, []);
        }
        grouped.get(colId).push(b);
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
function escapeHtml(str) {
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
function parseNetscapeHtml(html) {
    const results = [];
    // Match A tags with HREF, ADD_DATE, TAGS
    const linkRegex = /<A\s+([^>]*?)>(.*?)<\/A>(?:[\s\n]*<DD>(.*?)(?=<DT|<DL|<\/DL|$))?/gi;
    let currentFolder = 'Unsorted';
    // Find folders: <H3>FolderName</H3>
    const tokens = html.split(/(<H3[^>]*>.*?<\/H3>|<DL>|<\/DL>)/i);
    const folderStack = ['Unsorted'];
    for (const part of tokens) {
        const h3Match = part.match(/<H3[^>]*>(.*?)<\/H3>/i);
        if (h3Match) {
            currentFolder = h3Match[1].replace(/<[^>]+>/g, '').trim();
            folderStack.push(currentFolder);
        }
        else if (part.toUpperCase().startsWith('</DL>')) {
            if (folderStack.length > 1)
                folderStack.pop();
            currentFolder = folderStack[folderStack.length - 1];
        }
        let match;
        while ((match = linkRegex.exec(part)) !== null) {
            const attrsStr = match[1];
            const title = match[2].replace(/<[^>]+>/g, '').trim();
            const ddContent = match[3] ? match[3].replace(/<[^>]+>/g, '').trim() : '';
            const hrefMatch = attrsStr.match(/HREF="([^"]*)"/i);
            if (!hrefMatch)
                continue;
            const url = hrefMatch[1];
            const tagsMatch = attrsStr.match(/TAGS="([^"]*)"/i);
            const tags = tagsMatch ? tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
            const dateMatch = attrsStr.match(/ADD_DATE="([^"]*)"/i);
            let createdAt;
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
/**
 * Converts a string into a clean, URL-friendly slug.
 * Handles diacritics, symbols, spaces, and repeated dashes.
 * Example: "Mac App" -> "mac-app"
 */
function slugify(text) {
    if (!text)
        return '';
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}
/**
 * Returns the URL slug for a collection / category.
 * If the collection has a custom slug, it uses that.
 * Otherwise, it generates a clean slug from the title.
 * Specially maps "Mac App" -> "mac-apps" as requested.
 */
function getCollectionSlug(collection) {
    if (collection.slug && collection.slug.trim()) {
        return slugify(collection.slug);
    }
    if (collection.id === 'all')
        return '';
    if (collection.id === 'unsorted')
        return 'unsorted';
    if (collection.id === 'favorites')
        return 'favorites';
    if (collection.id === 'trash')
        return 'trash';
    const base = slugify(collection.title);
    // Specifically map "Mac App" to "mac-apps" as in example
    if (base === 'mac-app') {
        return 'mac-apps';
    }
    return base || collection.id;
}
/**
 * Returns the full web path for a collection (with trailing slash).
 * Examples:
 * - "all" -> "/"
 * - "unsorted" -> "/unsorted/"
 * - "favorites" -> "/favorites/"
 * - "trash" -> "/trash/"
 * - "Mac App" -> "/mac-apps/"
 */
function getCollectionPath(collectionOrId) {
    if (typeof collectionOrId === 'string') {
        if (collectionOrId === 'all')
            return '/';
        if (collectionOrId === 'unsorted')
            return '/unsorted/';
        if (collectionOrId === 'favorites')
            return '/favorites/';
        if (collectionOrId === 'trash')
            return '/trash/';
        return `/${collectionOrId}/`;
    }
    if (collectionOrId.id === 'all')
        return '/';
    if (collectionOrId.id === 'unsorted')
        return '/unsorted/';
    if (collectionOrId.id === 'favorites')
        return '/favorites/';
    if (collectionOrId.id === 'trash')
        return '/trash/';
    const slug = getCollectionSlug(collectionOrId);
    return slug ? `/${slug}/` : '/';
}
/**
 * Resolves a URL path or slug back to a collection or system collection ID.
 * Supports:
 * - Direct ID match
 * - Slug match ("mac-apps")
 * - Singular / Plural flexibility ("mac-apps" <-> "Mac App")
 * - Case-insensitive and punctuation-tolerant matching
 */
function findCollectionBySlug(collections, rawPath) {
    if (!rawPath)
        return 'all';
    const clean = rawPath.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
    if (clean === '' || clean === 'all')
        return 'all';
    if (clean === 'unsorted')
        return 'unsorted';
    if (clean === 'favorites')
        return 'favorites';
    if (clean === 'trash')
        return 'trash';
    // 1. Direct ID match
    const byId = collections.find((c) => c.id.toLowerCase() === clean);
    if (byId)
        return byId;
    // 2. Custom slug or getCollectionSlug match
    const bySlug = collections.find((c) => getCollectionSlug(c).toLowerCase() === clean);
    if (bySlug)
        return bySlug;
    // 3. Direct title slugify match
    const byTitleSlug = collections.find((c) => slugify(c.title).toLowerCase() === clean);
    if (byTitleSlug)
        return byTitleSlug;
    // 4. Singular / Plural flexibility (e.g. "mac-apps" vs "mac-app")
    const byPlural = collections.find((c) => {
        const s = slugify(c.title).toLowerCase();
        return (s + 's' === clean ||
            clean + 's' === s ||
            s.replace(/s$/, '') === clean.replace(/s$/, ''));
    });
    if (byPlural)
        return byPlural;
    // 5. Alphanumeric match ignoring hyphens/symbols
    const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');
    const byAlpha = collections.find((c) => {
        const titleAlpha = c.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (titleAlpha === cleanAlpha ||
            titleAlpha + 's' === cleanAlpha ||
            cleanAlpha + 's' === titleAlpha ||
            titleAlpha.replace(/s$/, '') === cleanAlpha.replace(/s$/, ''));
    });
    if (byAlpha)
        return byAlpha;
    return null;
}
async function traverseFileTree(entry) {
    const files = [];
    if (entry.isFile) {
        await new Promise((resolve) => {
            entry.file((file) => {
                files.push(file);
                resolve();
            }, () => resolve());
        });
    }
    else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readEntries = async () => {
            const entries = await new Promise((resolve) => {
                dirReader.readEntries((results) => resolve(results || []), () => resolve([]));
            });
            if (entries.length > 0) {
                for (const child of entries) {
                    const childFiles = await traverseFileTree(child);
                    files.push(...childFiles);
                }
                await readEntries();
            }
        };
        await readEntries();
    }
    return files;
}
function parseAnchorsFromHtml(html, addBookmark) {
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const anchors = doc.querySelectorAll('a[href]');
            for (const a of Array.from(anchors)) {
                const href = a.getAttribute('href');
                if (href && /^https?:\/\//i.test(href)) {
                    const title = a.textContent?.trim();
                    addBookmark(href, title);
                }
            }
            return;
        }
        catch { }
    }
    // Regex fallback if DOMParser is unavailable
    const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (/^https?:\/\//i.test(match[1])) {
            const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
            addBookmark(match[1], rawTitle);
        }
    }
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
async function extractBookmarksFromDataTransfer(dt) {
    if (!dt)
        return [];
    // Ignore internal Keepsake bookmark dragging
    const types = Array.from(dt.types || []);
    if (types.includes('keepsake/bookmark-id')) {
        return [];
    }
    const results = [];
    const seenUrls = new Set();
    const addBookmark = (url, title, collectionName) => {
        const trimmed = (url || '').trim();
        if (!trimmed || !/^https?:\/\//i.test(trimmed))
            return;
        try {
            const normalized = normalizeUrl(trimmed);
            if (!seenUrls.has(normalized)) {
                seenUrls.add(normalized);
                const cleanTitle = title?.trim();
                results.push({
                    url: normalized,
                    title: cleanTitle && cleanTitle !== normalized ? cleanTitle : undefined,
                    collectionName: collectionName?.trim() || undefined
                });
            }
        }
        catch {
            if (!seenUrls.has(trimmed)) {
                seenUrls.add(trimmed);
                results.push({
                    url: trimmed,
                    title: title?.trim() || undefined,
                    collectionName: collectionName?.trim() || undefined
                });
            }
        }
    };
    // 1. Process Dropped Files and Directories (e.g. bookmarks.html or desktop folder with bookmarks)
    try {
        const filesToRead = [];
        if (dt.items && dt.items.length > 0) {
            for (let i = 0; i < dt.items.length; i++) {
                const item = dt.items[i];
                if (typeof item.webkitGetAsEntry === 'function') {
                    const entry = item.webkitGetAsEntry();
                    if (entry) {
                        const entryFiles = await traverseFileTree(entry);
                        filesToRead.push(...entryFiles);
                        continue;
                    }
                }
                if (item.kind === 'file') {
                    const f = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
                    if (f)
                        filesToRead.push(f);
                }
            }
        }
        else if (dt.files && dt.files.length > 0) {
            filesToRead.push(...Array.from(dt.files));
        }
        for (const file of filesToRead) {
            const name = file.name.toLowerCase();
            if (name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html') {
                const text = await file.text();
                const parsed = parseNetscapeHtml(text);
                if (parsed.length > 0) {
                    for (const item of parsed) {
                        addBookmark(item.url, item.title, item.collectionName);
                    }
                }
                else {
                    parseAnchorsFromHtml(text, addBookmark);
                }
            }
            else if (name.endsWith('.webloc')) {
                const text = await file.text();
                const match = text.match(/<string>(https?:\/\/[^<]+)<\/string>/i) || text.match(/(https?:\/\/[^\s<"']+)/i);
                if (match) {
                    const fallbackTitle = file.name.replace(/\.webloc$/i, '');
                    addBookmark(match[1], fallbackTitle);
                }
            }
            else if (name.endsWith('.url')) {
                const text = await file.text();
                const match = text.match(/URL=(https?:\/\/[^\r\n]+)/i);
                if (match) {
                    const fallbackTitle = file.name.replace(/\.url$/i, '');
                    addBookmark(match[1], fallbackTitle);
                }
            }
        }
    }
    catch (err) {
        console.warn('[Keepsake] File extraction error:', err);
    }
    // If dropped files yielded bookmarks, return immediately
    if (results.length > 0) {
        return results;
    }
    // 2. Process text/html (contains multiple <a href="..."> tags when dragging bookmark folders or multi-selected bookmarks)
    try {
        const html = dt.getData('text/html');
        if (html && html.trim()) {
            if (/<H3/i.test(html) || /<DL/i.test(html)) {
                const parsed = parseNetscapeHtml(html);
                for (const item of parsed) {
                    addBookmark(item.url, item.title, item.collectionName);
                }
            }
            parseAnchorsFromHtml(html, addBookmark);
        }
    }
    catch { }
    // 3. Process text/uri-list (multiple lines of URLs when dragging bookmarks or folder)
    try {
        const uriList = dt.getData('text/uri-list');
        if (uriList) {
            const lines = uriList
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l && !l.startsWith('#'));
            for (const line of lines) {
                if (/^https?:\/\//i.test(line)) {
                    addBookmark(line);
                }
            }
        }
    }
    catch { }
    // 4. Process text/plain (single or multiple URLs, one per line or embedded)
    try {
        const text = dt.getData('text/plain') || dt.getData('Text');
        if (text) {
            const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (/^https?:\/\//i.test(line)) {
                    addBookmark(line);
                }
                else {
                    const matches = line.matchAll(/(https?:\/\/[^\s"'<>]+)/gi);
                    for (const m of matches) {
                        addBookmark(m[1]);
                    }
                }
            }
        }
    }
    catch { }
    return results;
}
/**
 * Extracts a single valid HTTP/HTTPS URL and optional title from a browser drag-and-drop event.
 * Synchronous helper for backward compatibility.
 */
function extractUrlFromDataTransfer(dt) {
    if (!dt)
        return null;
    // Ignore internal bookmark drags
    const types = Array.from(dt.types || []);
    if (types.includes('keepsake/bookmark-id')) {
        return null;
    }
    // 1. Check text/uri-list (standard URI drag from Chrome/Firefox tabs & address bar)
    try {
        const uriList = dt.getData('text/uri-list');
        if (uriList) {
            const lines = uriList
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l && !l.startsWith('#'));
            for (const line of lines) {
                if (/^https?:\/\//i.test(line)) {
                    return { url: line };
                }
            }
        }
    }
    catch { }
    // 2. Check text/html (frequently contains <a href="...">Title</a>)
    try {
        const html = dt.getData('text/html');
        if (html) {
            const match = html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/i);
            if (match && /^https?:\/\//i.test(match[1])) {
                const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
                return {
                    url: match[1],
                    title: rawTitle && rawTitle !== match[1] ? rawTitle : undefined
                };
            }
        }
    }
    catch { }
    // 3. Check plain text
    try {
        const text = dt.getData('text/plain') || dt.getData('Text');
        if (text) {
            const trimmed = text.trim();
            if (/^https?:\/\//i.test(trimmed)) {
                return { url: trimmed };
            }
            const match = trimmed.match(/(https?:\/\/[^\s]+)/i);
            if (match) {
                return { url: match[1] };
            }
        }
    }
    catch { }
    return null;
}
//# sourceMappingURL=utils.js.map