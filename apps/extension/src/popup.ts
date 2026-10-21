import {
  Bookmark,
  Collection,
  extractDomain,
  getFaviconUrl,
  normalizeUrl,
  getYouTubeThumbnail,
  getYouTubeVideoId,
  isRedditUrl,
  cleanRedditTitle
} from '@keepsake/shared';

interface ExtensionStorage {
  serverUrl?: string;
  bookmarks?: Bookmark[];
  collections?: Collection[];
  authSession?: any;
}

let currentBookmark: Bookmark | null = null;
let currentUrl = '';
let currentTitle = '';
let currentDomain = '';
let currentFavicon = '';
let currentCover = '';
let currentTags: string[] = [];
let isStarred = false;
let collections: Collection[] = [];
let activeServerUrl = 'http://localhost:3000';

// DOM Elements
const statusBadge = document.getElementById('statusBadge') as HTMLSpanElement;
const pageTitle = document.getElementById('pageTitle') as HTMLDivElement;
const domainLabel = document.getElementById('domainLabel') as HTMLSpanElement;
const faviconImg = document.getElementById('faviconImg') as HTMLImageElement;
const coverImg = document.getElementById('coverImg') as HTMLImageElement;
const collectionSelect = document.getElementById('collectionSelect') as HTMLSelectElement;
const starBtn = document.getElementById('starBtn') as HTMLButtonElement;
const tagInput = document.getElementById('tagInput') as HTMLInputElement;
const tagsContainer = document.getElementById('tagsContainer') as HTMLDivElement;
const noteInput = document.getElementById('noteInput') as HTMLTextAreaElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const deleteBtn = document.getElementById('deleteBtn') as HTMLButtonElement;
const toggleSettings = document.getElementById('toggleSettings') as HTMLAnchorElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLDivElement;
const serverUrlInput = document.getElementById('serverUrlInput') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;

// Render Tag Chips
function renderTags() {
  tagsContainer.innerHTML = '';
  currentTags.forEach((tag) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `#${tag} <span data-tag="${tag}">×</span>`;
    chip.querySelector('span')?.addEventListener('click', () => {
      currentTags = currentTags.filter((t) => t !== tag);
      renderTags();
    });
    tagsContainer.appendChild(chip);
  });
}

// Add Tag
function addTag(rawTag: string) {
  const clean = rawTag.trim().toLowerCase().replace(/^#/, '');
  if (clean && !currentTags.includes(clean)) {
    currentTags.push(clean);
    renderTags();
  }
  tagInput.value = '';
}

function renderCollectionOptions(cols: Collection[]) {
  collectionSelect.innerHTML = '<option value="unsorted">📥 Unsorted</option>';
  cols
    .filter((c) => !c.isSystem)
    .forEach((col) => {
      const opt = document.createElement('option');
      opt.value = col.id;
      opt.textContent = `📁 ${col.title}`;
      collectionSelect.appendChild(opt);
    });
}

function populateBookmarkUI(bm: Bookmark) {
  statusBadge.textContent = 'Saved ✓';
  statusBadge.classList.add('saved');
  saveBtn.textContent = 'Update Bookmark';
  deleteBtn.style.display = 'block';

  if (bm.title) {
    pageTitle.textContent = bm.title;
  }
  if (bm.collectionId) {
    collectionSelect.value = bm.collectionId;
  }
  if (bm.tags) {
    currentTags = [...bm.tags];
    renderTags();
  }
  if (bm.note) {
    noteInput.value = bm.note;
  }
  if (bm.isFavorite) {
    isStarred = true;
    starBtn.classList.add('active');
  }
  if (bm.cover) {
    currentCover = bm.cover;
    coverImg.src = currentCover;
    coverImg.style.display = 'block';
  }
}

// Initialize Popup
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  currentUrl = normalizeUrl(tab.url);
  currentTitle = tab.title || '';
  currentDomain = extractDomain(currentUrl);
  currentFavicon = tab.favIconUrl || getFaviconUrl(currentDomain);

  // Setup initial UI
  pageTitle.textContent = currentTitle || currentDomain;
  domainLabel.textContent = currentDomain;
  faviconImg.src = currentFavicon;

  // Auto-detect YouTube thumbnail immediately from URL
  const ytInitialThumb = getYouTubeThumbnail(currentUrl);
  if (ytInitialThumb) {
    currentCover = ytInitialThumb;
    coverImg.src = currentCover;
    coverImg.style.display = 'block';
  }

  // Ask content script for rich DOM metadata & selected text
  try {
    const meta = await chrome.tabs.sendMessage(tab.id!, { action: 'GET_PAGE_METADATA' });
    if (meta) {
      if (meta.title && !currentTitle) currentTitle = meta.title;
      if (isRedditUrl(currentUrl) && currentTitle) {
        currentTitle = cleanRedditTitle(currentTitle);
        pageTitle.textContent = currentTitle;
      }
      if (
        meta.cover &&
        !meta.cover.includes('yt_1200.png') &&
        !meta.cover.includes('youtube.com/img/desktop') &&
        !meta.cover.includes('redditstatic.com') &&
        !meta.cover.includes('icon.png')
      ) {
        currentCover = meta.cover;
        coverImg.src = currentCover;
        coverImg.style.display = 'block';
      } else if (ytInitialThumb) {
        currentCover = ytInitialThumb;
        coverImg.src = currentCover;
        coverImg.style.display = 'block';
      }
      if (meta.selectedText && !noteInput.value) {
        noteInput.value = `> ${meta.selectedText}\n\n`;
      }
      // Auto-populate suggested tags (e.g. subreddit name)
      if (meta.tags && Array.isArray(meta.tags) && currentTags.length === 0) {
        meta.tags.forEach((t: string) => addTag(t));
      }
    }
  } catch {
    // Content script might not be injected on special pages (e.g. chrome://)
  }

  // Load storage
  chrome.storage.local.get(['serverUrl', 'bookmarks', 'collections'], async (res: ExtensionStorage) => {
    if (res.serverUrl) {
      activeServerUrl = res.serverUrl.replace(/\/+$/, '');
    }
    serverUrlInput.value = activeServerUrl;

    if (res.collections && res.collections.length > 0) {
      collections = res.collections;
      renderCollectionOptions(collections);
    }

    // Try to fetch latest collections from server
    if (activeServerUrl) {
      try {
        const colRes = await fetch(`${activeServerUrl}/api/collections`);
        if (colRes.ok) {
          const colData = await colRes.json();
          if (colData.collections && colData.collections.length > 0) {
            collections = colData.collections;
            chrome.storage.local.set({ collections });
            renderCollectionOptions(collections);
          }
        }
      } catch (err) {
        console.warn('[Keepsake Extension] Server collections fetch failed:', err);
      }
    }

    // Check if current URL is already saved (try server first, then local fallback)
    let foundBm: Bookmark | null = null;

    if (activeServerUrl) {
      try {
        const checkRes = await fetch(`${activeServerUrl}/api/bookmarks?url=${encodeURIComponent(currentUrl)}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.bookmarks && checkData.bookmarks.length > 0) {
            foundBm = checkData.bookmarks[0];
          }
        }
      } catch (err) {
        console.warn('[Keepsake Extension] Server check failed:', err);
      }
    }

    if (!foundBm) {
      const savedList: Bookmark[] = res.bookmarks || [];
      foundBm = savedList.find((b) => b.url === currentUrl && !b.isTrash) || null;
    }

    currentBookmark = foundBm;

    if (currentBookmark) {
      populateBookmarkUI(currentBookmark);
    } else {
      statusBadge.textContent = 'New Link';
      statusBadge.classList.remove('saved');
      saveBtn.textContent = 'Save to Keepsake';
      deleteBtn.style.display = 'none';
    }
  });
}

// Event Listeners
tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagInput.value);
  }
});

starBtn.addEventListener('click', () => {
  isStarred = !isStarred;
  starBtn.classList.toggle('active', isStarred);
});

toggleSettings.addEventListener('click', () => {
  settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
});

saveSettingsBtn.addEventListener('click', () => {
  const url = serverUrlInput.value.trim().replace(/\/+$/, '');
  activeServerUrl = url || 'http://localhost:3000';
  chrome.storage.local.set({ serverUrl: activeServerUrl }, () => {
    saveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
      settingsPanel.style.display = 'none';
    }, 800);
  });
});

// Save / Update Bookmark
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  const now = new Date().toISOString();

  // If YouTube video, ensure thumbnail is saved and type is video
  const ytThumb = getYouTubeThumbnail(currentUrl);
  let finalCover = currentCover || undefined;
  if (finalCover && (finalCover.includes('redditstatic.com') || finalCover.includes('icon.png'))) {
    finalCover = undefined;
  }
  if (ytThumb && (!finalCover || finalCover.includes('yt_1200.png') || finalCover.includes('youtube.com/img/desktop'))) {
    finalCover = ytThumb;
  }

  const isVideo = !!getYouTubeVideoId(currentUrl);

  let newBm: Bookmark = {
    id: currentBookmark ? currentBookmark.id : 'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
    url: currentUrl,
    title: currentTitle || currentDomain,
    description: currentBookmark?.description || '',
    note: noteInput.value.trim(),
    domain: currentDomain,
    favicon: currentFavicon,
    cover: finalCover,
    collectionId: collectionSelect.value || 'unsorted',
    tags: currentTags,
    isFavorite: isStarred,
    isTrash: false,
    type: isVideo ? 'video' : (currentBookmark?.type || 'link'),
    createdAt: currentBookmark ? currentBookmark.createdAt : now,
    updatedAt: now
  };

  // 1. Post to Server if activeServerUrl is configured
  if (activeServerUrl) {
    try {
      const serverRes = await fetch(`${activeServerUrl}/api/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBm)
      });

      if (serverRes.ok) {
        const data = await serverRes.json();
        if (data.bookmark) {
          newBm = data.bookmark;
        }
      }
    } catch (err) {
      console.error('[Keepsake Extension] Could not reach server, saving locally:', err);
    }
  }

  // 2. Also save to chrome.storage.local
  chrome.storage.local.get(['bookmarks'], (res) => {
    const bookmarks: Bookmark[] = res.bookmarks || [];
    const updatedList = currentBookmark
      ? bookmarks.map((b) => (b.id === newBm.id ? newBm : b))
      : [newBm, ...bookmarks.filter((b) => b.url !== currentUrl)];

    chrome.storage.local.set({ bookmarks: updatedList }, () => {
      saveBtn.textContent = 'Saved ✓';
      statusBadge.textContent = 'Saved ✓';
      statusBadge.classList.add('saved');

      // Forward to background script for badge update & tab broadcast
      chrome.runtime.sendMessage({ action: 'BOOKMARK_SAVED', bookmark: newBm });

      setTimeout(() => window.close(), 600);
    });
  });
});

// Delete Bookmark
deleteBtn.addEventListener('click', async () => {
  if (!currentBookmark) return;
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Deleting...';

  // 1. Delete on server if configured
  if (activeServerUrl) {
    try {
      await fetch(`${activeServerUrl}/api/bookmarks/${currentBookmark.id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('[Keepsake Extension] Server delete failed:', err);
    }
  }

  // 2. Delete in chrome.storage.local
  chrome.storage.local.get(['bookmarks'], (res) => {
    const bookmarks: Bookmark[] = res.bookmarks || [];
    const updated = bookmarks.filter((b) => b.id !== currentBookmark!.id);
    chrome.storage.local.set({ bookmarks: updated }, () => {
      chrome.runtime.sendMessage({ action: 'BOOKMARK_DELETED', id: currentBookmark!.id });
      setTimeout(() => window.close(), 300);
    });
  });
});

init();
