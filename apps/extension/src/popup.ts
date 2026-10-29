import {
  Bookmark,
  Collection,
  extractDomain,
  getFaviconUrl,
  normalizeUrl,
  getYouTubeThumbnail,
  getYouTubeVideoId,
  isRedditUrl,
  cleanRedditTitle,
  isGenericRedditMedia,
  isValidMediaUrl,
  flattenCollections
} from '@keepsake/shared';

interface ExtensionStorage {
  serverUrl?: string;
  bookmarks?: Bookmark[];
  collections?: Collection[];
  authSession?: any;
  lastCollectionId?: string;
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
const openCollectionCreate = document.getElementById('openCollectionCreate') as HTMLButtonElement;
const collectionCreate = document.getElementById('collectionCreate') as HTMLDivElement;
const collectionName = document.getElementById('collectionName') as HTMLInputElement;
const collectionParent = document.getElementById('collectionParent') as HTMLSelectElement;
const createCollectionBtn = document.getElementById('createCollectionBtn') as HTMLButtonElement;
const cancelCollectionBtn = document.getElementById('cancelCollectionBtn') as HTMLButtonElement;
const collectionMessage = document.getElementById('collectionMessage') as HTMLDivElement;
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

function renderCollectionOptions(cols: Collection[], preferredId?: string) {
  const currentVal = preferredId || collectionSelect.value || 'unsorted';
  collectionSelect.innerHTML = '<option value="unsorted">📥 Unsorted</option>';
  flattenCollections(cols)
    .filter(({ collection: col }) => col.id !== 'all' && col.id !== 'trash' && col.id !== 'favorites')
    .forEach(({ collection: col, depth }) => {
      const opt = document.createElement('option');
      opt.value = col.id;
      opt.textContent = `${'— '.repeat(depth)}📁 ${col.title}`;
      collectionSelect.appendChild(opt);
    });

  const hasOption = Array.from(collectionSelect.options).some((o) => o.value === currentVal);
  if (hasOption) {
    collectionSelect.value = currentVal;
  }
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
        isValidMediaUrl(meta.cover) &&
        !meta.cover.includes('yt_1200.png') &&
        !meta.cover.includes('youtube.com/img/desktop')
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
  chrome.storage.local.get(['serverUrl', 'bookmarks', 'collections', 'lastCollectionId'], async (res: ExtensionStorage) => {
    if (res.serverUrl) {
      activeServerUrl = res.serverUrl.replace(/\/+$/, '');
    }
    serverUrlInput.value = activeServerUrl;

    const savedLastCollectionId = res.lastCollectionId;

    if (res.collections && res.collections.length > 0) {
      collections = res.collections;
      renderCollectionOptions(collections, savedLastCollectionId);
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
            const preferred = currentBookmark?.collectionId || collectionSelect.value || savedLastCollectionId;
            renderCollectionOptions(collections, preferred);
          }
        }
      } catch (err) {
        console.warn('[Keepsake Extension] Server collections fetch failed:', err);
      }
    }
    openCollectionCreate.disabled = false;

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
      const pendingKey = `keepsake_pending_capture_${currentBookmark.id}`;
      const pending = await chrome.storage.local.get(pendingKey);
      if (pending[pendingKey]) {
        statusBadge.textContent = 'Sync pending';
        statusBadge.classList.remove('saved');
      }
    } else {
      statusBadge.textContent = 'New Link';
      statusBadge.classList.remove('saved');
      saveBtn.textContent = 'Save to Keepsake';
      deleteBtn.style.display = 'none';

      if (savedLastCollectionId) {
        const hasOption = Array.from(collectionSelect.options).some((o) => o.value === savedLastCollectionId);
        if (hasOption) {
          collectionSelect.value = savedLastCollectionId;
        }
      }
    }
  });
}

// Event Listeners
function closeCollectionCreate() {
  collectionCreate.classList.remove('open');
  openCollectionCreate.setAttribute('aria-expanded', 'false');
  collectionName.value = '';
}

openCollectionCreate.addEventListener('click', () => {
  collectionMessage.textContent = '';
  collectionParent.replaceChildren(new Option('None (top level)', ''));
  flattenCollections(collections).forEach(({ collection, depth }) => {
    const option = document.createElement('option');
    option.value = collection.id;
    option.textContent = `${'— '.repeat(depth)}${collection.title}`;
    collectionParent.appendChild(option);
  });
  collectionParent.value = collectionSelect.value === 'unsorted' ? '' : collectionSelect.value;
  collectionCreate.classList.add('open');
  openCollectionCreate.setAttribute('aria-expanded', 'true');
  collectionName.focus();
});
cancelCollectionBtn.addEventListener('click', () => { closeCollectionCreate(); openCollectionCreate.focus(); });
collectionName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); createCollectionBtn.click(); }
  if (event.key === 'Escape') { event.preventDefault(); closeCollectionCreate(); openCollectionCreate.focus(); }
});
createCollectionBtn.addEventListener('click', async () => {
  const title = collectionName.value.trim();
  collectionMessage.textContent = '';
  if (!title) { collectionMessage.textContent = 'Enter a collection name.'; collectionName.focus(); return; }
  const parentId = collectionParent.value || null;
  const existing = collections.find((col) => !col.isSystem && (col.parentId || null) === parentId && col.title.trim().toLowerCase() === title.toLowerCase());
  if (existing) {
    renderCollectionOptions(collections, existing.id);
    await chrome.storage.local.set({ lastCollectionId: existing.id });
    closeCollectionCreate();
    collectionMessage.textContent = 'That collection already exists; it has been selected.';
    return;
  }
  createCollectionBtn.disabled = true;
  cancelCollectionBtn.disabled = true;
  saveBtn.disabled = true;
  createCollectionBtn.textContent = 'Creating…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${activeServerUrl}/api/collections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, parentId }), signal: controller.signal
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const data = await response.json();
    const created: Collection | undefined = data.collection;
    if (!created?.id || typeof created.title !== 'string') throw new Error('Invalid server response');
    collections = [...collections.filter((col) => col.id !== created.id), created];
    renderCollectionOptions(collections, created.id);
    closeCollectionCreate();
    collectionMessage.textContent = `Created “${created.title}” and selected it.`;
    try { await chrome.storage.local.set({ collections, lastCollectionId: created.id }); }
    catch { collectionMessage.textContent = `Created “${created.title}”, but could not update the extension cache.`; }
    chrome.runtime.sendMessage({ action: 'COLLECTION_CREATED' }).catch(() => {});
  } catch (error) {
    collectionMessage.textContent = error instanceof Error && error.name === 'AbortError' ? 'Server did not respond. Check whether the collection was created before retrying.' : `Could not create collection: ${error instanceof Error ? error.message : 'server unavailable'}`;
  } finally {
    clearTimeout(timeout);
    createCollectionBtn.disabled = false;
    cancelCollectionBtn.disabled = false;
    saveBtn.disabled = false;
    createCollectionBtn.textContent = 'Create';
  }
});
collectionSelect.addEventListener('change', () => {
  const chosen = collectionSelect.value;
  if (chosen) {
    chrome.storage.local.set({ lastCollectionId: chosen });
  }
});
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
  if (finalCover && !isValidMediaUrl(finalCover) && !ytThumb) {
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
  let serverSaved = false;
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
          serverSaved = true;
        }
      }
    } catch (err) {
      console.error('[Keepsake Extension] Could not reach server, saving locally:', err);
    }
  }

  try {
    if (!serverSaved) {
      const queued = await chrome.runtime.sendMessage({ action: 'QUEUE_POPUP_CAPTURE', serverUrl: activeServerUrl, bookmark: newBm });
      if (!queued?.success) throw new Error(queued?.error || 'Unable to queue bookmark');
    } else {
      const result = await chrome.runtime.sendMessage({ action: 'CLEAR_PENDING_CAPTURE', id: currentBookmark?.id || newBm.id });
      if (!result?.success) throw new Error('Could not clear the pending save');
    }
    // 2. Also save to chrome.storage.local
    const res = await chrome.storage.local.get(['bookmarks']);
    const bookmarks: Bookmark[] = res.bookmarks || [];
    const updatedList = [newBm, ...bookmarks.filter((b) => b.id !== newBm.id && normalizeUrl(b.url) !== normalizeUrl(currentUrl))];
    await chrome.storage.local.set({ bookmarks: updatedList, lastCollectionId: collectionSelect.value || 'unsorted' });
    saveBtn.textContent = serverSaved ? 'Saved ✓' : 'Queued for sync';
    statusBadge.textContent = serverSaved ? 'Saved ✓' : 'Sync pending';
    statusBadge.classList.toggle('saved', serverSaved);
    if (serverSaved) chrome.runtime.sendMessage({ action: 'BOOKMARK_SAVED', bookmark: newBm }).catch(() => {});
    setTimeout(() => window.close(), serverSaved ? 600 : 1500);
  } catch (error) {
    statusBadge.textContent = serverSaved ? 'Saved on server' : 'Save failed';
    statusBadge.classList.toggle('saved', serverSaved);
    saveBtn.textContent = serverSaved ? 'Saved on server' : 'Retry save';
    saveBtn.disabled = false;
    collectionMessage.textContent = serverSaved ? 'Saved on the server, but the extension could not finish updating its local state.' : 'Could not save or queue this bookmark. Try again.';
  }
});

// Delete Bookmark
deleteBtn.addEventListener('click', async () => {
  if (!currentBookmark) return;
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Deleting...';

  // 1. Delete on server if configured
  if (activeServerUrl) {
    try {
      const response = await fetch(`${activeServerUrl}/api/bookmarks/${currentBookmark.id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
    } catch (err) {
      console.error('[Keepsake Extension] Server delete failed:', err);
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Retry removal';
      statusBadge.textContent = 'Removal failed';
      statusBadge.classList.remove('saved');
      collectionMessage.textContent = 'Could not remove the bookmark from the server. Try again when connected.';
      return;
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
