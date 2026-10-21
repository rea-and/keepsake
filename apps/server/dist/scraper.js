import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { extractDomain, getFaviconUrl, normalizeUrl, getYouTubeThumbnail, getYouTubeVideoId, parseRedditUrl, isRedditUrl, cleanRedditTitle } from '@keepsake/shared';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
export async function scrapeUrl(rawUrl) {
    const url = normalizeUrl(rawUrl);
    const domain = extractDomain(url);
    // 1. Specialized Reddit Ingestion (Direct JSON API)
    if (isRedditUrl(url)) {
        const redditInfo = parseRedditUrl(url);
        if (redditInfo?.postId) {
            const redditMeta = await scrapeRedditPost(redditInfo, url);
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
                    content: article.content,
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
    try {
        const jsonUrl = `https://www.reddit.com/comments/${info.postId}.json`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(jsonUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        clearTimeout(timeout);
        if (!res.ok)
            return null;
        const data = await res.json();
        const post = data?.[0]?.data?.children?.[0]?.data;
        if (!post)
            return null;
        const title = post.title ? cleanRedditTitle(post.title) : canonicalUrl;
        const subreddit = post.subreddit || info.subreddit || '';
        const author = post.author || '';
        const selftext = (post.selftext || '').trim();
        // Extract high-res image
        let cover;
        if (post.preview?.images?.[0]?.source?.url) {
            cover = post.preview.images[0].source.url.replace(/&amp;/g, '&');
        }
        else if (post.url && /\.(jpe?g|png|gif|webp)$/i.test(post.url)) {
            cover = post.url;
        }
        else if (post.thumbnail && post.thumbnail.startsWith('http')) {
            cover = post.thumbnail;
        }
        // Detect type
        let type = 'link';
        if (post.is_video || post.domain === 'v.redd.it') {
            type = 'video';
        }
        else if (post.post_hint === 'image' || (cover && (cover.includes('i.redd.it') || cover.includes('preview.redd.it')))) {
            type = 'image';
        }
        else if (selftext && selftext.length > 80) {
            type = 'article';
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
                byline: author ? `u/${author} in r/${subreddit}` : `r/${subreddit}`,
                content: cleanHtml,
                textContent: selftext,
                length: selftext.length,
                siteName: `r/${subreddit}`
            };
        }
        return {
            url: canonicalUrl,
            title,
            description: selftext ? selftext.slice(0, 280) : (post.url_overridden_by_dest ? `Link: ${post.url_overridden_by_dest}` : `Reddit post in r/${subreddit}`),
            domain: 'reddit.com',
            favicon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png',
            cover,
            type,
            siteName: subreddit ? `r/${subreddit}` : 'Reddit',
            readerContent
        };
    }
    catch {
        return null;
    }
}
