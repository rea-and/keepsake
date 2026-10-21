"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUrl = normalizeUrl;
exports.extractDomain = extractDomain;
exports.getFaviconUrl = getFaviconUrl;
exports.exportToNetscapeHtml = exportToNetscapeHtml;
exports.parseNetscapeHtml = parseNetscapeHtml;
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
//# sourceMappingURL=utils.js.map