import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { isIP, BlockList } from 'net';
import dns from 'dns/promises';
import { Agent } from 'undici';
import {
  BookmarkType,
  ScrapedMetadata,
  ReaderContent,
  extractDomain,
  getFaviconUrl,
  normalizeUrl,
  getYouTubeThumbnail,
  getYouTubeVideoId,
  parseRedditUrl,
  isRedditUrl,
  cleanRedditTitle,
  isGenericRedditMedia,
  isValidMediaUrl,
  cleanRedditMediaUrl,
  RedditPostInfo
} from '@keepsake/shared';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REDDIT_BOT_UA = 'facebookexternalhit/1.3 (+http://www.facebook.com/externalhit_uatext.php)';

// ==========================================
// SSRF Defense: Validate URL & Private IP Checks
// ==========================================
const blockedAddresses = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blockedAddresses.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blockedAddresses.addSubnet(address, prefix, 'ipv6');
function isPrivateOrLoopbackIP(ip: string): boolean {
  const family = isIP(ip);
  return family === 0 || blockedAddresses.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

// Resolve and validate at connection time; this prevents a hostname from passing
// one DNS lookup and resolving to a private address during the actual request.
const safeAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dns.lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
        if (!addresses.length || addresses.some((entry) => isPrivateOrLoopbackIP(entry.address))) {
          callback(new Error('DNS address blocked by security policy'), '', 0);
          return;
        }
        const compatible = options.family ? addresses.filter((entry) => entry.family === options.family) : addresses;
        if (!compatible.length) {
          callback(new Error('No compatible DNS address'), '', 0);
        } else if (options.all) {
          callback(null, compatible);
        } else {
          callback(null, compatible[0].address, compatible[0].family);
        }
      }).catch((error) => callback(error, '', 0));
    }
  }
});

export async function validateSafeUrl(urlString: string): Promise<boolean> {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    if (parsed.username || parsed.password) return false;
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
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
    } catch {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function fetchSafeUrl(input: string, init: RequestInit = {}): Promise<Response> {
  let current = input;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (!(await validateSafeUrl(current))) throw new Error('URL blocked by security policy');
    const response = await fetch(current, { ...init, redirect: 'manual', dispatcher: safeAgent } as RequestInit & { dispatcher: Agent });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect is missing a location');
    await response.body?.cancel();
    current = new URL(location, current).toString();
  }
  throw new Error('Too many redirects');
}

export async function readLimitedText(response: Response, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error('Response is too large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new Error('Response is too large');
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString('utf8');
    };
    return await Promise.race([read(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Response body timed out')), 10000); })]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await reader.cancel().catch(() => {});
  }
}

export function extractSocialPreview(html: string, pageUrl: string): string | undefined {
  const $ = cheerio.load(html);
  const selectors = [
    'meta[property="og:image:secure_url"]', 'meta[property="og:image:url"]', 'meta[property="og:image"]',
    'meta[name="og:image"]', 'meta[name="twitter:image"]', 'meta[property="twitter:image"]',
    'meta[name="twitter:image:src"]', 'meta[property="twitter:image:src"]',
    'meta[itemprop="image"]', 'link[rel="image_src"]'
  ];
  for (const selector of selectors) {
    for (const element of $(selector).toArray()) {
      const raw = $(element).attr('content') || $(element).attr('href');
      if (!raw?.trim()) continue;
      try {
        const resolved = new URL(raw.trim(), pageUrl);
        if (['http:', 'https:'].includes(resolved.protocol) && !resolved.username && !resolved.password && !isGenericRedditMedia(resolved.href)) return resolved.href;
      } catch {}
    }
  }
  try {
    const page = new URL(pageUrl);
    if (page.hostname.toLowerCase() === 'github.com') {
      const parts = page.pathname.split('/').filter(Boolean);
      const reserved = new Set(['features', 'topics', 'explore', 'marketplace', 'settings', 'login', 'search', 'organizations']);
      if (parts.length >= 2 && !reserved.has(parts[0].toLowerCase()) && /^[\w.-]+$/.test(parts[0]) && /^[\w.-]+$/.test(parts[1])) {
        return `https://opengraph.githubassets.com/1/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1].replace(/\.git$/, ''))}`;
      }
    }
  } catch {}
  return undefined;
}

export function extractRedditPreview(data: any): string | undefined {
  const post = Array.isArray(data) ? data[0]?.data?.children?.[0]?.data : data?.data?.children?.[0]?.data || data;
  if (!post || typeof post !== 'object') return undefined;
  const candidates: unknown[] = [];
  for (const item of Array.isArray(post.gallery_data?.items) ? post.gallery_data.items : []) {
    const media = post.media_metadata?.[item.media_id];
    candidates.push(media?.s?.u, media?.s?.gif, media?.p?.[media.p.length - 1]?.u);
  }
  candidates.push(post.preview?.images?.[0]?.source?.url, post.secure_media?.reddit_video?.fallback_url, post.thumbnail, post.url_overridden_by_dest, post.url);
  if (Array.isArray(post.crosspost_parent_list)) candidates.push(extractRedditPreview(post.crosspost_parent_list[0]));
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const cleaned = cleanRedditMediaUrl(candidate);
    if (cleaned && isValidMediaUrl(cleaned)) {
      try { const url = new URL(cleaned); if (url.protocol === 'https:' || url.protocol === 'http:') return url.href; } catch {}
    }
  }
  return undefined;
}

// ==========================================
// HTML Sanitizer for Reader Mode
// ==========================================
function sanitizeHtmlContent(dirtyHtml: string): string {
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
  } catch {
    return dirtyHtml;
  }
}

export async function scrapeUrl(rawUrl: string): Promise<ScrapedMetadata> {
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
    let initialHtml = '';

    // If it's a shortlink (/s/) or redd.it or missing postId, resolve redirect or fetch OpenGraph
    if (!redditInfo?.postId || canonicalUrl.includes('/s/') || extractDomain(canonicalUrl) === 'redd.it') {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const redirectRes = await fetchSafeUrl(canonicalUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': REDDIT_BOT_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        clearTimeout(timeout);
        if (redirectRes.ok) {
          if (redirectRes.url && redirectRes.url !== canonicalUrl) {
            canonicalUrl = redirectRes.url;
            redditInfo = parseRedditUrl(canonicalUrl);
          }
          initialHtml = await readLimitedText(redirectRes);
          // Extract canonical og:url if redirect didn't update url
          const ogUrlMatch = initialHtml.match(/<meta property=["']og:url["'] content=["']([^"']+)["']/i);
          if (ogUrlMatch?.[1]) {
            const ogUrl = ogUrlMatch[1];
            const parsedOg = parseRedditUrl(ogUrl);
            if (parsedOg?.postId) {
              canonicalUrl = ogUrl;
              redditInfo = parsedOg;
            }
          }
        }
      } catch {
        // Fall back to original
      }
    }

    const redditMeta = await scrapeRedditPost(redditInfo, canonicalUrl, initialHtml);
    if (redditMeta) {
      return redditMeta;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetchSafeUrl(url, {
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

    const html = await readLimitedText(res);
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
    let cover: string | undefined;
    cover = extractSocialPreview(html, res.url || url);

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
    let favicon: string | undefined;
    if (domain.includes('reddit.com') || domain === 'redd.it') {
      favicon = 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png';
    } else {
      const iconHref =
        $('link[rel="apple-touch-icon"]').attr('href') ||
        $('link[rel="icon"][sizes="32x32"]').attr('href') ||
        $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href');

      if (iconHref) {
        try {
          favicon = new URL(iconHref, url).href;
        } catch {
          favicon = getFaviconUrl(domain);
        }
      } else {
        favicon = getFaviconUrl(domain);
      }
    }

    // 6. Detect Type
    let type: BookmarkType = 'link';
    if (
      getYouTubeVideoId(url) ||
      domain.includes('youtube.com') ||
      domain.includes('youtu.be') ||
      domain.includes('vimeo.com') ||
      domain.includes('tiktok.com') ||
      $('meta[property="og:type"]').attr('content') === 'video'
    ) {
      type = 'video';
    }

    // 7. Extract Reader Mode Article Content
    let readerContent: ReaderContent | undefined;
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
    } catch {
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
  } catch (err: any) {
    return fallbackMetadata(url, domain, err.message);
  }
}

function fallbackMetadata(url: string, domain: string, errorMsg?: string): ScrapedMetadata {
  return {
    url,
    title: domain,
    description: errorMsg ? `Saved from ${domain}` : '',
    domain,
    favicon: getFaviconUrl(domain),
    cover: extractSocialPreview('', url),
    type: 'link'
  };
}

async function scrapeRedditPost(info: RedditPostInfo | null, canonicalUrl: string, initialHtml?: string): Promise<ScrapedMetadata | null> {
  const subreddit = info?.subreddit || '';
  let title = '';
  let cover: string | undefined;
  let selftext = '';
  let author = '';
  let type: BookmarkType = 'link';

  if (info?.postId) {
    try {
      const endpoint = `https://www.reddit.com/comments/${encodeURIComponent(info.postId)}.json?raw_json=1&limit=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetchSafeUrl(endpoint, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
        if (response.ok) {
          const data = JSON.parse(await readLimitedText(response));
          const post = data?.[0]?.data?.children?.[0]?.data;
          cover = extractRedditPreview(data);
          title = typeof post?.title === 'string' ? cleanRedditTitle(post.title) : '';
          selftext = typeof post?.selftext === 'string' ? post.selftext : '';
          author = typeof post?.author === 'string' ? post.author : '';
          if (post?.is_video) type = 'video';
        }
      } finally { clearTimeout(timeout); }
    } catch { /* Reddit may restrict its JSON endpoint; continue with public metadata. */ }
  }

  // Strategy 0: Parse OpenGraph from initialHtml (e.g. from /s/ resolution)
  if (initialHtml) {
    const ogTitleMatch = initialHtml.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
    const ogDescMatch = initialHtml.match(/<meta property=["']og:description["'] content=["']([^"']+)["']/i);
    const ogImageMatch = initialHtml.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    const twitterImageMatch = initialHtml.match(/<meta (?:name|property)=["']twitter:image(?::src)?["'] content=["']([^"']+)["']/i);

    if (ogTitleMatch) {
      title = cleanRedditTitle(ogTitleMatch[1]);
    }
    const rawImg = extractSocialPreview(initialHtml, canonicalUrl) || ogImageMatch?.[1] || twitterImageMatch?.[1];
    if (rawImg) {
      const cleaned = cleanRedditMediaUrl(rawImg);
      if (!cover && cleaned && isValidMediaUrl(cleaned)) {
        cover = cleaned;
      }
    }
    if (ogDescMatch) {
      const desc = ogDescMatch[1].trim();
      if (desc && !desc.startsWith('Explore this post') && !desc.startsWith('From the ')) {
        selftext = desc;
      }
    }
  }

  // Strategy 1: Reddit oEmbed API (official, fast, never bot-blocked, gives clean post title)
  if (!title && info?.postId) {
    try {
      const oembedUrl = `https://www.reddit.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const oembedRes = await fetchSafeUrl(oembedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': REDDIT_BOT_UA
        }
      });
      clearTimeout(timeout);

      if (oembedRes.ok) {
        const oembedData = JSON.parse(await readLimitedText(oembedRes)) as any;
        if (oembedData.title) {
          title = cleanRedditTitle(oembedData.title);
        }
        if (oembedData.author_name) {
          author = oembedData.author_name;
        }
      }
    } catch {
      // oEmbed fallback
    }
  }

  // Strategy 2: Public Reddit RSS Feed (extracts real high-res CDN media thumbnails and post selftext)
  if (info?.postId) {
    try {
      const rssTarget = subreddit
        ? `https://www.reddit.com/r/${subreddit}/comments/${info.postId}/.rss`
        : `https://www.reddit.com/comments/${info.postId}/.rss`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetchSafeUrl(rssTarget, {
      signal: controller.signal,
      headers: {
        'User-Agent': REDDIT_BOT_UA,
        'Accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const xml = await readLimitedText(res);

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

      const mediaMatch = xml.match(/<media:(?:thumbnail|content)[^>]+url="([^"]+)"/i);
      const directMatch = xml.match(/https:\/\/i\.redd\.it\/[a-zA-Z0-9_\-\.]+\.(?:jpe?g|png|webp|gif)/i);
      const previewMatch = xml.match(/https:\/\/(?:preview|external-preview|a\.thumbs|b\.thumbs)\.redd(?:it|\.it)\/[^"&<>\s]+(?:\?[^"<>\s]*)?/i);

      const candidateRaw = directMatch?.[0] || mediaMatch?.[1] || previewMatch?.[0];
      if (candidateRaw) {
        const cleaned = cleanRedditMediaUrl(candidateRaw);
        if (!cover && cleaned && isValidMediaUrl(cleaned)) {
          cover = cleaned;
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
  } catch {
    // RSS fallback
  }
}

  // Strategy 3: OpenGraph fallback for description, title, and cover image
  if (!selftext || !title || !cover) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const ogRes = await fetchSafeUrl(canonicalUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': REDDIT_BOT_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(timeout);

      if (ogRes.ok) {
        const html = await readLimitedText(ogRes);
        const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
        const ogDescMatch = html.match(/<meta property=["']og:description["'] content=["']([^"']+)["']/i);
        const ogImageMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
        const twitterImageMatch = html.match(/<meta (?:name|property)=["']twitter:image(?::src)?["'] content=["']([^"']+)["']/i);

        if (!title && ogTitleMatch) {
          title = cleanRedditTitle(ogTitleMatch[1]);
        }
        if (!cover) {
          const rawImg = extractSocialPreview(html, ogRes.url || canonicalUrl) || ogImageMatch?.[1] || twitterImageMatch?.[1];
          if (rawImg) {
            const cleaned = cleanRedditMediaUrl(rawImg);
            if (cleaned && isValidMediaUrl(cleaned)) {
              cover = cleaned;
            }
          }
        }
        if (!selftext && ogDescMatch) {
          const desc = ogDescMatch[1].trim();
          if (desc && !desc.startsWith('Explore this post') && !desc.startsWith('From the ')) {
            selftext = desc;
          }
        }
      }
    } catch {
      // OpenGraph fallback
    }
  }

  if (cover && isValidMediaUrl(cover)) {
    if (type !== 'video') type = 'image';
  } else {
    cover = undefined;
  }

  let readerContent: ReaderContent | undefined;
  if (selftext) {
    const cleanHtml = selftext
      .split('\n\n')
      .filter(Boolean)
      .map((p: string) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
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
