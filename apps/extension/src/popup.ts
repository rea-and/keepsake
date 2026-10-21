import { Bookmark, Collection, extractDomain, getFaviconUrl, normalizeUrl } from '@keepsake/shared';

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

  // Ask content script for rich DOM metadata & selected text
  try {
    const meta = await chrome.tabs.sendMessage(tab.id!, { action: 'GET_PAGE_METADATA' });
    if (meta) {
      if (meta.title && !currentTitle) currentTitle = meta.title;
      if (meta.cover) {
        currentCover = meta.cover;
        coverImg.src = currentCover;
        coverImg.style.display = 'block';
      }
      if (meta.selectedText && !noteInput.value) {
        noteInput.value = `> ${meta.selectedText}\n\n`;
      }
    }
  } catch {
    // Content script might not be injected on special pages (e.g. chrome://)
  }

  // Load storage
  chrome.storage.local.get(['serverUrl', 'bookmarks', 'collections'], (res: ExtensionStorage) => {
    if (res.serverUrl) {
      serverUrlInput.value = res.serverUrl;
    }

    if (res.collections && res.collections.length > 0) {
      collections = res.collections;
      collectionSelect.innerHTML = '<option value="unsorted">📥 Unsorted</option>';
      collections
        .filter((c) => !c.isSystem)
        .forEach((col) => {
          const opt = document.createElement('option');
          opt.value = col.id;
          opt.textContent = `📁 ${col.title}`;
          collectionSelect.appendChild(opt);
        });
    }

    // Check if current URL is already saved
    const savedList: Bookmark[] = res.bookmarks || [];
    currentBookmark = savedList.find((b) => b.url === currentUrl && !b.isTrash) || null;

    if (currentBookmark) {
      statusBadge.textContent = 'Saved ✓';
      statusBadge.classList.add('saved');
      saveBtn.textContent = 'Update Bookmark';
      deleteBtn.style.display = 'block';

      if (currentBookmark.collectionId) {
        collectionSelect.value = currentBookmark.collectionId;
      }
      if (currentBookmark.tags) {
        currentTags = [...currentBookmark.tags];
        renderTags();
      }
      if (currentBookmark.note) {
        noteInput.value = currentBookmark.note;
      }
      if (currentBookmark.isFavorite) {
        isStarred = true;
        starBtn.classList.add('active');
      }
      if (currentBookmark.cover) {
        currentCover = currentBookmark.cover;
        coverImg.src = currentCover;
        coverImg.style.display = 'block';
      }
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
  const url = serverUrlInput.value.trim();
  chrome.storage.local.set({ serverUrl: url }, () => {
    alert('Server URL saved!');
    settingsPanel.style.display = 'none';
  });
});

// Save / Update Bookmark
saveBtn.addEventListener('click', () => {
  const now = new Date().toISOString();
  chrome.storage.local.get(['bookmarks', 'serverUrl'], (res) => {
    const bookmarks: Bookmark[] = res.bookmarks || [];

    const newBm: Bookmark = {
      id: currentBookmark ? currentBookmark.id : 'bm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      url: currentUrl,
      title: currentTitle || currentDomain,
      description: currentBookmark?.description || '',
      note: noteInput.value.trim(),
      domain: currentDomain,
      favicon: currentFavicon,
      cover: currentCover || undefined,
      collectionId: collectionSelect.value || 'unsorted',
      tags: currentTags,
      isFavorite: isStarred,
      isTrash: false,
      type: 'link',
      createdAt: currentBookmark ? currentBookmark.createdAt : now,
      updatedAt: now
    };

    const updatedList = currentBookmark
      ? bookmarks.map((b) => (b.id === newBm.id ? newBm : b))
      : [newBm, ...bookmarks];

    chrome.storage.local.set({ bookmarks: updatedList }, () => {
      saveBtn.textContent = 'Saved!';
      statusBadge.textContent = 'Saved ✓';
      statusBadge.classList.add('saved');

      // Forward to background script for server sync & badge update
      chrome.runtime.sendMessage({ action: 'BOOKMARK_SAVED', bookmark: newBm });

      setTimeout(() => window.close(), 600);
    });
  });
});

// Delete Bookmark
deleteBtn.addEventListener('click', () => {
  if (!currentBookmark) return;
  chrome.storage.local.get(['bookmarks'], (res) => {
    const bookmarks: Bookmark[] = res.bookmarks || [];
    const updated = bookmarks.filter((b) => b.id !== currentBookmark!.id);
    chrome.storage.local.set({ bookmarks: updated }, () => {
      chrome.runtime.sendMessage({ action: 'BOOKMARK_DELETED', id: currentBookmark!.id });
      window.close();
    });
  });
});

init();
