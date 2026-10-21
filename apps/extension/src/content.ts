/**
 * Keepsake Content Script
 * Extracts high-fidelity metadata and selected text directly from the active webpage DOM
 * Relays extension messages to the Keepsake Web App
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_METADATA') {
    const ogImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');

    const ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      document.querySelector('meta[name="description"]')?.getAttribute('content');

    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href');

    const selectedText = window.getSelection()?.toString().trim() || '';

    sendResponse({
      title: document.title,
      url: canonicalUrl || window.location.href,
      description: ogDesc || '',
      cover: ogImage || '',
      selectedText
    });
  } else if (request.action === 'KEEPSAKE_SYNC') {
    // Notify web app listening via window.addEventListener('message')
    window.postMessage({ type: 'KEEPSAKE_SYNC_TRIGGER' }, '*');
  }
  return true;
});
