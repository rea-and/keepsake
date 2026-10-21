/**
 * Keepsake Content Script
 * Extracts high-fidelity metadata and selected text directly from the active webpage DOM
 * Relays extension messages to the Keepsake Web App
 */
import { getYouTubeThumbnail, getYouTubeVideoId } from '@keepsake/shared';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_METADATA') {
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const pageUrl = canonicalUrl || window.location.href;

    let ogImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      document.querySelector('link[itemprop="thumbnailUrl"]')?.getAttribute('href');

    // If on YouTube or if og:image is generic YouTube branding (yt_1200.png), extract the video thumbnail
    const ytThumb = getYouTubeThumbnail(pageUrl) || getYouTubeThumbnail(window.location.href);
    if (ytThumb && (!ogImage || ogImage.includes('yt_1200.png') || ogImage.includes('youtube.com/img/desktop'))) {
      ogImage = ytThumb;
    }

    const ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      document.querySelector('meta[name="description"]')?.getAttribute('content');

    const selectedText = window.getSelection()?.toString().trim() || '';

    sendResponse({
      title: document.title,
      url: pageUrl,
      description: ogDesc || '',
      cover: ogImage || '',
      selectedText,
      isVideo: !!getYouTubeVideoId(pageUrl)
    });
  } else if (request.action === 'KEEPSAKE_SYNC') {
    // Notify web app listening via window.addEventListener('message')
    window.postMessage({ type: 'KEEPSAKE_SYNC_TRIGGER' }, '*');
  }
  return true;
});
