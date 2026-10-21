/**
 * Keepsake Content Script
 * Extracts high-fidelity metadata and selected text directly from the active webpage DOM
 * Specialized scrapers for YouTube, Reddit, and standard OpenGraph sites
 */
import {
  getYouTubeThumbnail,
  getYouTubeVideoId,
  parseRedditUrl,
  cleanRedditTitle
} from '@keepsake/shared';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_METADATA') {
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const pageUrl = canonicalUrl || window.location.href;
    const hostname = window.location.hostname.toLowerCase();

    let pageTitle = document.title;
    let ogImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      document.querySelector('link[itemprop="thumbnailUrl"]')?.getAttribute('href');

    let ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      '';

    const selectedText = window.getSelection()?.toString().trim() || '';
    const suggestedTags: string[] = [];
    let isVideo = !!getYouTubeVideoId(pageUrl);
    let isImage = false;

    // 1. YouTube Specialized Ingestion
    const ytThumb = getYouTubeThumbnail(pageUrl) || getYouTubeThumbnail(window.location.href);
    if (ytThumb && (!ogImage || ogImage.includes('yt_1200.png') || ogImage.includes('youtube.com/img/desktop'))) {
      ogImage = ytThumb;
      isVideo = true;
    }

    // 2. Reddit Specialized Ingestion
    if (hostname.includes('reddit.com') || hostname === 'redd.it') {
      const redditInfo = parseRedditUrl(pageUrl) || parseRedditUrl(window.location.href);

      // Clean post title from shreddit-post or document.title
      const shredditPost = document.querySelector('shreddit-post');
      const shredditTitle = shredditPost?.getAttribute('post-title');
      if (shredditTitle) {
        pageTitle = shredditTitle;
      } else {
        pageTitle = cleanRedditTitle(pageTitle);
      }

      // Detect subreddit and suggest as tag
      const subreddit =
        shredditPost?.getAttribute('subreddit-prefixed-name')?.replace(/^r\//i, '') ||
        redditInfo?.subreddit;
      if (subreddit) {
        suggestedTags.push(subreddit.toLowerCase());
      }

      // Extract high-resolution media cover
      const redditMedia =
        shredditPost?.getAttribute('content-href') ||
        shredditPost?.getAttribute('thumbnail-src') ||
        document.querySelector('shreddit-player')?.getAttribute('poster') ||
        document.querySelector('img[alt="Post image"]')?.getAttribute('src') ||
        document.querySelector('div[data-click-id="media"] img')?.getAttribute('src') ||
        document.querySelector('figure img')?.getAttribute('src');

      if (redditMedia && (redditMedia.startsWith('http') || redditMedia.startsWith('//'))) {
        ogImage = redditMedia.startsWith('//') ? `https:${redditMedia}` : redditMedia;
      } else if (ogImage) {
        // Decode HTML entities in Reddit preview images
        ogImage = ogImage.replace(/&amp;/g, '&');
      }

      // Extract post text body if available
      const textBody =
        document.querySelector('div[slot="text-body"]')?.textContent?.trim() ||
        document.querySelector('div[data-click-id="text"]')?.textContent?.trim();
      if (textBody && (!ogDesc || ogDesc.length < textBody.length)) {
        ogDesc = textBody.slice(0, 300);
      }

      // Detect post type
      const postType = shredditPost?.getAttribute('post-type');
      if (postType === 'video' || document.querySelector('shreddit-player') || document.querySelector('video')) {
        isVideo = true;
      } else if (postType === 'image' || (ogImage && /\.(jpe?g|png|gif|webp)/i.test(ogImage))) {
        isImage = true;
      }
    }

    sendResponse({
      title: pageTitle,
      url: pageUrl,
      description: ogDesc || '',
      cover: ogImage || '',
      selectedText,
      tags: suggestedTags,
      isVideo,
      isImage
    });
  } else if (request.action === 'KEEPSAKE_SYNC') {
    window.postMessage({ type: 'KEEPSAKE_SYNC_TRIGGER' }, '*');
  }
  return true;
});
