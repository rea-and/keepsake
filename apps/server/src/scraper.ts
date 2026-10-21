import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { BookmarkType, ScrapedMetadata, ReaderContent, extractDomain, getFaviconUrl, normalizeUrl } from '@keepsake/shared';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function scrapeUrl(rawUrl: string): Promise<ScrapedMetadata> {
  const url = normalizeUrl(rawUrl);
  const domain = extractDomain(url);

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
    const title = (ogTitle || twitterTitle || pageTitle || h1 || domain).trim();

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
    const ogImage = $('meta[property="og:image"]').attr('content');
    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    const rawCover = ogImage || twitterImage;

    if (rawCover) {
      try {
        cover = new URL(rawCover, url).href;
      } catch {
        cover = rawCover;
      }
    }

    // 5. Favicon
    let favicon: string | undefined;
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

    // 6. Detect Type
    let type: BookmarkType = 'link';
    if (
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
          content: article.content,
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
    type: 'link'
  };
}
