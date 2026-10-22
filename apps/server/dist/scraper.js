import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { isIP } from 'net';
import dns from 'dns/promises';
import { extractDomain, getFaviconUrl, normalizeUrl, getYouTubeThumbnail, getYouTubeVideoId, parseRedditUrl, isRedditUrl, cleanRedditTitle, isValidMediaUrl } from '@keepsake/shared';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// ==========================================
// SSRF Defense: Validate URL & Private IP Checks
// ==========================================
function isPrivateOrLoopbackIP(ip) {
    if (ip.startsWith('127.'))
        return true; // IPv4 loopback
    if (ip.startsWith('10.'))
        return true; // 10.0.0.0/8
    if (ip.startsWith('192.168.'))
        return true; // 192.168.0.0/16
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip))
        return true; // 172.16.0.0/12
    if (ip.startsWith('169.254.'))
        return true; // Link-local / Cloud metadata (169.254.169.254)
    if (ip.startsWith('0.'))
        return true;
    if (ip === '255.255.255.255')
        return true;
    if (ip === '::1' || ip === '::')
        return true;
    if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd'))
        return true; // Unique local IPv6
    if (ip.toLowerCase().startsWith('fe80'))
        return true; // Link-local IPv6
    if (ip.startsWith('::ffff:')) {
        return isPrivateOrLoopbackIP(ip.substring(7));
    }
    return false;
}
export async function validateSafeUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'localhost' ||
            hostname === '0.0.0.0' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname.endsWith('.localhost') ||
            hostname.endsWith('.local') ||
            hostname.endsWith('.internal')) {
            return false;
        }
        if (isIP(hostname)) {
            return !isPrivateOrLoopbackIP(hostname);
        }
        try {
            const records = await dns.lookup(hostname, { all: true });
            for (const rec of records) {
                if (isPrivateOrLoopbackIP(rec.address)) {
                    return false;
                }
            }
        }
        catch {
            // DNS resolution failure will be handled by fetch
            return true;
        }
        return true;
    }
    catch {
        return false;
    }
}
// ==========================================
// HTML Sanitizer for Reader Mode
// ==========================================
function sanitizeHtmlContent(dirtyHtml) {
    try {
        const dom = new JSDOM(`<!DOCTYPE html><html><body>${dirtyHtml}</body></html>`);
        const doc = dom.window.document;
        // Disallowed elements
        const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'base', 'form', 'input', 'button', 'link'];
        dangerousTags.forEach((tag) => {
            doc.querySelectorAll(tag).forEach((el) => el.remove());
        });
        // Remove event handlers and javascript: URIs from all remaining elements
        const allElements = doc.querySelectorAll('*');
        allElements.forEach((el) => {
            // Clean attributes
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
                const name = attr.name.toLowerCase();
                const val = attr.value.trim().toLowerCase();
                // Remove on* event handlers (e.g. onerror, onload, onclick)
                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                    continue;
                }
                // Remove javascript: or vbscript: or data: (except data:image)
                if (name === 'href' || name === 'src' || name === 'action' || name === 'formaction') {
                    if (val.startsWith('javascript:') || val.startsWith('vbscript:') || (val.startsWith('data:') && !val.startsWith('data:image/'))) {
                        el.removeAttribute(attr.name);
                    }
                }
            }
        });
        return doc.body.innerHTML;
    }
    catch {
        return dirtyHtml;
    }
}
export async function scrapeUrl(rawUrl) {
    const url = normalizeUrl(rawUrl);
    const domain = extractDomain(url);
    // SSRF Protection
    const isSafe = await validateSafeUrl(url);
    if (!isSafe) {
        return fallbackMetadata(url, domain, 'URL blocked by security policy');
    }
    // 1. Specialized Reddit Ingestion (Direct JSON API / oEmbed / OpenGraph)
    if (isRedditUrl(url)) {
        let canonicalUrl = url;
        let redditInfo = parseRedditUrl(canonicalUrl);
        // If it's a shortlink (/s/) or redd.it or missing postId, resolve redirect first
        if (!redditInfo?.postId || canonicalUrl.includes('/s/') || extractDomain(canonicalUrl) === 'redd.it') {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 6000);
                const redirectRes = await fetch(canonicalUrl, {
                    method: 'GET',
                    redirect: 'follow',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'facebookexternalhit/1.3 (+http://www.facebook.com/externalhit_uatext.php)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                clearTimeout(timeout);
                if (redirectRes.url && redirectRes.url !== canonicalUrl) {
                    canonicalUrl = redirectRes.url;
                    redditInfo = parseRedditUrl(canonicalUrl);
                }
            }
            catch {
                // Fall back to original
            }
        }
        if (redditInfo?.postId) {
            const redditMeta = await scrapeRedditPost(redditInfo, canonicalUrl);
            if (redditMeta) {
                return redditMeta;
            }
        }
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        clearTimeout(timeout);
        if (!res.ok) {
            return fallbackMetadata(url, domain, `HTTP ${res.status}`);
        }
        const contentType = res.headers.get('content-type') || '';
        // Handle direct image URLs
        if (contentType.startsWith('image/')) {
            return {
                url,
                title: url.split('/').pop() || domain,
                description: `Image from ${domain}`,
                domain,
                favicon: getFaviconUrl(domain),
                cover: url,
                type: 'image'
            };
        }
        const html = await res.text();
        const $ = cheerio.load(html);
        // 1. Title
        const ogTitle = $('meta[property="og:title"]').attr('content');
        const twitterTitle = $('meta[name="twitter:title"]').attr('content');
        const pageTitle = $('title').text().trim();
        const h1 = $('h1').first().text().trim();
        let title = (ogTitle || twitterTitle || pageTitle || h1 || domain).trim();
        if (domain.includes('reddit.com') || domain === 'redd.it') {
            title = cleanRedditTitle(title) || title;
        }
        // 2. Description
        const ogDesc = $('meta[property="og:description"]').attr('content');
        const twitterDesc = $('meta[name="twitter:description"]').attr('content');
        const metaDesc = $('meta[name="description"]').attr('content');
        const description = (ogDesc || twitterDesc || metaDesc || '').trim();
        // 3. Site Name
        const ogSiteName = $('meta[property="og:site_name"]').attr('content');
        const siteName = ogSiteName || domain;
        // 4. Cover Image
        let cover;
        const ogImage = $('meta[property="og:image"]').attr('content');
        const twitterImage = $('meta[name="twitter:image"]').attr('content');
        const rawCover = ogImage || twitterImage;
        if (rawCover) {
            try {
                cover = new URL(rawCover, url).href;
            }
            catch {
                cover = rawCover;
            }
        }
        // High quality YouTube thumbnail override
        const ytThumb = getYouTubeThumbnail(url);
        if (ytThumb && (!cover || cover.includes('yt_1200.png') || cover.includes('youtube.com/img/desktop'))) {
            cover = ytThumb;
        }
        // Clean Reddit preview images
        if (cover && (domain.includes('reddit.com') || domain === 'redd.it')) {
            cover = cover.replace(/&amp;/g, '&');
        }
        // 5. Favicon
        let favicon;
        if (domain.includes('reddit.com') || domain === 'redd.it') {
            favicon = 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png';
        }
        else {
            const iconHref = $('link[rel="apple-touch-icon"]').attr('href') ||
                $('link[rel="icon"][sizes="32x32"]').attr('href') ||
                $('link[rel="icon"]').attr('href') ||
                $('link[rel="shortcut icon"]').attr('href');
            if (iconHref) {
                try {
                    favicon = new URL(iconHref, url).href;
                }
                catch {
                    favicon = getFaviconUrl(domain);
                }
            }
            else {
                favicon = getFaviconUrl(domain);
            }
        }
        // 6. Detect Type
        let type = 'link';
        if (getYouTubeVideoId(url) ||
            domain.includes('youtube.com') ||
            domain.includes('youtu.be') ||
            domain.includes('vimeo.com') ||
            domain.includes('tiktok.com') ||
            $('meta[property="og:type"]').attr('content') === 'video') {
            type = 'video';
        }
        // 7. Extract Reader Mode Article Content
        let readerContent;
        try {
            const doc = new JSDOM(html, { url });
            const reader = new Readability(doc.window.document);
            const article = reader.parse();
            if (article && article.content && article.textContent && article.textContent.trim().length > 300) {
                if (type === 'link') {
                    type = 'article';
                }
                readerContent = {
                    title: article.title || title,
                    byline: article.byline || undefined,
                    content: sanitizeHtmlContent(article.content),
                    textContent: article.textContent.trim(),
                    length: article.length,
                    excerpt: article.excerpt || description,
                    siteName: article.siteName || siteName
                };
            }
        }
        catch {
            // Reader parse is best-effort
        }
        return {
            url,
            title: title || domain,
            description: description || readerContent?.excerpt || '',
            domain,
            favicon,
            cover,
            type,
            siteName,
            readerContent
        };
    }
    catch (err) {
        return fallbackMetadata(url, domain, err.message);
    }
}
function fallbackMetadata(url, domain, errorMsg) {
    return {
        url,
        title: domain,
        description: errorMsg ? `Saved from ${domain}` : '',
        domain,
        favicon: getFaviconUrl(domain),
        type: 'link'
    };
}
async function scrapeRedditPost(info, canonicalUrl) {
    if (!info.postId)
        return null;
    const subreddit = info.subreddit || '';
    let title = '';
    let cover;
    let selftext = '';
    let author = '';
    let type = 'link';
    const REDDIT_BOT_UA = 'facebookexternalhit/1.3 (+http://www.facebook.com/externalhit_uatext.php)';
    // Strategy 1: Reddit oEmbed API (official, fast, never bot-blocked, gives clean post title)
    try {
        const oembedUrl = `https://www.reddit.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const oembedRes = await fetch(oembedUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': REDDIT_BOT_UA
            }
        });
        clearTimeout(timeout);
        if (oembedRes.ok) {
            const oembedData = (await oembedRes.json());
            if (oembedData.title) {
                title = cleanRedditTitle(oembedData.title);
            }
            if (oembedData.author_name) {
                author = oembedData.author_name;
            }
        }
    }
    catch {
        // oEmbed fallback
    }
    // Strategy 2: Public Reddit RSS Feed (extracts real high-res CDN media thumbnails and post selftext)
    try {
        const rssTarget = subreddit
            ? `https://www.reddit.com/r/${subreddit}/comments/${info.postId}/.rss`
            : `https://www.reddit.com/comments/${info.postId}/.rss`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(rssTarget, {
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
            }
        });
        clearTimeout(timeout);
        if (res.ok) {
            const xml = await res.text();
            if (!title) {
                const titleMatch = xml.match(/<entry>[^]*?<title>([^<]+)<\/title>/i) || xml.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) {
                    title = cleanRedditTitle(titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
                }
            }
            if (!author) {
                const authorMatch = xml.match(/<author>[^]*?<name>(?:\/u\/)?([^<]+)<\/name>/i);
                if (authorMatch) {
                    author = authorMatch[1].replace(/^\/u\//i, '');
                }
            }
            const thumbMatch = xml.match(/<media:thumbnail[^>]+url="([^"]+)"/i) ||
                xml.match(/<media:content[^>]+url="([^"]+)"/i) ||
                xml.match(/https:\/\/(?:preview|i|external-preview|a\.thumbs|b\.thumbs)\.redd(?:it|\.it)\/[^"&<>\s]+(?:\?[^"<>\s]*)?/i);
            if (thumbMatch) {
                const candidateCover = (thumbMatch[1] || thumbMatch[0]).replace(/&amp;/g, '&');
                if (isValidMediaUrl(candidateCover)) {
                    cover = candidateCover;
                }
            }
            if (!selftext) {
                const contentMatch = xml.match(/<content[^>]*type="html"[^>]*>([\s\S]*?)<\/content>/i);
                if (contentMatch) {
                    const rawContent = contentMatch[1]
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&')
                        .replace(/&#39;/g, "'")
                        .replace(/&quot;/g, '"');
                    const textOnly = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    if (textOnly && textOnly.length > 20 && !textOnly.includes('submitted by') && !textOnly.includes('[link]')) {
                        selftext = textOnly;
                    }
                }
            }
        }
    }
    catch {
        // RSS fallback
    }
    // Strategy 3: OpenGraph fallback for description and title
    if (!selftext || !title) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const ogRes = await fetch(canonicalUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': REDDIT_BOT_UA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            clearTimeout(timeout);
            if (ogRes.ok) {
                const html = await ogRes.text();
                const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
                const ogDescMatch = html.match(/<meta property=["']og:description["'] content=["']([^"']+)["']/i);
                if (!title && ogTitleMatch) {
                    title = cleanRedditTitle(ogTitleMatch[1]);
                }
                if (!selftext && ogDescMatch) {
                    const desc = ogDescMatch[1].trim();
                    if (desc && !desc.startsWith('Explore this post') && !desc.startsWith('From the ')) {
                        selftext = desc;
                    }
                }
            }
        }
        catch {
            // OpenGraph fallback
        }
    }
    if (cover && isValidMediaUrl(cover)) {
        type = 'image';
    }
    else {
        cover = undefined;
    }
    let readerContent;
    if (selftext) {
        const cleanHtml = selftext
            .split('\n\n')
            .filter(Boolean)
            .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
        readerContent = {
            title,
            byline: author ? `u/${author} in r/${subreddit}` : (subreddit ? `r/${subreddit}` : undefined),
            content: sanitizeHtmlContent(cleanHtml),
            textContent: selftext,
            length: selftext.length,
            siteName: subreddit ? `r/${subreddit}` : 'Reddit'
        };
    }
    return {
        url: canonicalUrl,
        title: title || canonicalUrl,
        description: selftext ? selftext.slice(0, 280) : (subreddit ? `Reddit post in r/${subreddit}` : 'Reddit post'),
        domain: 'reddit.com',
        favicon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png',
        cover,
        type,
        siteName: subreddit ? `r/${subreddit}` : 'Reddit',
        readerContent
    };
}
