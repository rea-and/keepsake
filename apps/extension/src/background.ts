import {
  Bookmark,
  extractDomain,
  getFaviconUrl,
  normalizeUrl,
  getYouTubeThumbnail,
  getYouTubeVideoId
} from '@keepsake/shared';

// Setup Context Menus on Installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'keepsake_save_page',
    title: 'Save Page to Keepsake',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'keepsake_save_link',
    title: 'Save Link to Keepsake',
    contexts: ['link']
  });

  chrome.contextMenus.create({
    id: 'keepsake_save_selection',
    title: 'Save Selection as Note in Keepsake',
    contexts: ['selection']
  });
});

// Helper: Post bookmark to Keepsake server
async function postBookmarkToServer(serverUrl: string, bookmark: Bookmark) {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  try {
    await fetch(`${cleanUrl}/api/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookmark)
    });
  } catch (err) {
    console.warn('[Keepsake Background] Failed to POST bookmark to server:', err);
  }
}

// Helper: Notify Keepsake tabs to sync
async function notifyKeepsakeTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && (tab.url.includes(':3000') || tab.url.includes(':5173') || tab.url.includes('keepsake'))) {
        chrome.tabs.sendMessage(tab.id, { action: 'KEEPSAKE_SYNC' }).catch(() => {});
      }
    }
  } catch {}
}

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const now = new Date().toISOString();
  let targetUrl = '';
  let targetTitle = '';
  let targetNote = '';

  if (info.menuItemId === 'keepsake_save_link' && info.linkUrl) {
    targetUrl = normalizeUrl(info.linkUrl);
    targetTitle = extractDomain(targetUrl);
  } else if (info.menuItemId === 'keepsake_save_selection' && info.selectionText) {
    targetUrl = normalizeUrl(tab.url || '');
    targetTitle = tab.title || '';
    targetNote = `> ${info.selectionText}`;
  } else {
    targetUrl = normalizeUrl(tab.url || '');
    targetTitle = tab.title || '';
  }

  const domain = extractDomain(targetUrl);
  const ytThumb = getYouTubeThumbnail(targetUrl);
  const isVideo = !!getYouTubeVideoId(targetUrl);

  const bookmark: Bookmark = {
    id: 'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
    url: targetUrl,
    title: targetTitle || domain,
    description: '',
    note: targetNote,
    domain,
    favicon: tab.favIconUrl || getFaviconUrl(domain),
    cover: ytThumb || undefined,
    collectionId: 'unsorted',
    tags: [],
    isFavorite: false,
    isTrash: false,
    type: isVideo ? 'video' : 'link',
    createdAt: now,
    updatedAt: now
  };

  chrome.storage.local.get(['bookmarks', 'serverUrl'], async (res) => {
    const list: Bookmark[] = res.bookmarks || [];
    const updated = [bookmark, ...list.filter((b) => b.url !== targetUrl)];
    chrome.storage.local.set({ bookmarks: updated });

    // Show visual badge checkmark
    showSuccessBadge(tab.id!);

    // If server URL is configured, save bookmark on server
    const serverUrl = res.serverUrl || 'http://localhost:3000';
    if (serverUrl) {
      await postBookmarkToServer(serverUrl, bookmark);
      await notifyKeepsakeTabs();
    }
  });
});

// Handle Keyboard Shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save_keepsake') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.id) return;

    const url = normalizeUrl(tab.url);
    const domain = extractDomain(url);
    const ytThumb = getYouTubeThumbnail(url);
    const isVideo = !!getYouTubeVideoId(url);
    const now = new Date().toISOString();

    const bookmark: Bookmark = {
      id: 'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      url,
      title: tab.title || domain,
      description: '',
      domain,
      favicon: tab.favIconUrl || getFaviconUrl(domain),
      cover: ytThumb || undefined,
      collectionId: 'unsorted',
      tags: [],
      isFavorite: false,
      isTrash: false,
      type: isVideo ? 'video' : 'link',
      createdAt: now,
      updatedAt: now
    };

    chrome.storage.local.get(['bookmarks', 'serverUrl'], async (res) => {
      const list: Bookmark[] = res.bookmarks || [];
      chrome.storage.local.set({ bookmarks: [bookmark, ...list.filter((b) => b.url !== url)] });
      showSuccessBadge(tab.id!);

      const serverUrl = res.serverUrl || 'http://localhost:3000';
      if (serverUrl) {
        await postBookmarkToServer(serverUrl, bookmark);
        await notifyKeepsakeTabs();
      }
    });
  }
});

// Message listener from popup
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'BOOKMARK_SAVED' || message.action === 'BOOKMARK_DELETED') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) showSuccessBadge(tabs[0].id);
    });
    notifyKeepsakeTabs();
  }
});

function showSuccessBadge(tabId: number) {
  chrome.action.setBadgeText({ text: '✓', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId });
  }, 2500);
}
