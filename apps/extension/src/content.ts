/**
 * Keepsake Content Script
 * Extracts high-fidelity metadata and selected text directly from the active webpage DOM
 * Specialized scrapers for YouTube, Reddit, and standard OpenGraph sites
 * Injects one-click "Book" bookmark button into Reddit feeds
 */
import {
  getYouTubeThumbnail,
  getYouTubeVideoId,
  parseRedditUrl,
  cleanRedditTitle,
  isGenericRedditMedia,
  isValidMediaUrl
} from '@keepsake/shared';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_METADATA') {
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const pageUrl = canonicalUrl || window.location.href;
    const hostname = window.location.hostname.toLowerCase();

    let pageTitle = document.title;
    let rawOgImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      document.querySelector('link[itemprop="thumbnailUrl"]')?.getAttribute('href');

    let ogImage: string | undefined = rawOgImage || undefined;

    let ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      '';

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

      // Discard generic Reddit favicon from ogImage
      if (isGenericRedditMedia(ogImage)) {
        ogImage = undefined;
      }

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
      let redditMedia: string | undefined = undefined;
      const contentHref = shredditPost?.getAttribute('content-href');
      const thumbSrc = shredditPost?.getAttribute('thumbnail-src');

      if (contentHref && isValidMediaUrl(contentHref)) {
        redditMedia = contentHref;
      } else if (thumbSrc && isValidMediaUrl(thumbSrc)) {
        redditMedia = thumbSrc;
      }

      if (!redditMedia) {
        const player = document.querySelector('shreddit-player');
        const poster = player?.getAttribute('poster');
        if (poster && isValidMediaUrl(poster)) {
          redditMedia = poster;
        }
      }

      if (!redditMedia) {
        const img = document.querySelector<HTMLImageElement>(
          'img[src*="preview.redd.it"], img[src*="i.redd.it"], img[src*="external-preview.redd.it"], shreddit-aspect-ratio img, img[alt="Post image"], div[data-click-id="media"] img, figure img'
        );
        if (img?.src && isValidMediaUrl(img.src)) {
          redditMedia = img.src;
        }
      }

      if (redditMedia) {
        ogImage = (redditMedia.startsWith('//') ? `https:${redditMedia}` : redditMedia).replace(/&amp;/g, '&');
      } else if (ogImage && isValidMediaUrl(ogImage)) {
        ogImage = ogImage.replace(/&amp;/g, '&');
      } else {
        ogImage = undefined;
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
      tags: suggestedTags,
      isVideo,
      isImage
    });
  } else if (request.action === 'KEEPSAKE_SYNC') {
    window.postMessage({ type: 'KEEPSAKE_SYNC_TRIGGER' }, '*');
  }
  return true;
});

// ==========================================
// Reddit Feed "Book" Quick-Action Injection
// ==========================================

function ensureStyles() {
  if (document.getElementById('keepsake-reddit-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'keepsake-reddit-styles';
  styleEl.textContent = `
    .keepsake-reddit-book-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      height: 32px !important;
      padding: 0 10px !important;
      border-radius: 9999px !important;
      border: 1px solid transparent !important;
      background: var(--color-neutral-background-weak, rgba(128, 128, 128, 0.12)) !important;
      color: var(--color-neutral-content-weak, #878a8c) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      margin: 0 4px !important;
      user-select: none !important;
      line-height: 1 !important;
      vertical-align: middle !important;
      box-sizing: border-box !important;
      position: relative !important;
      z-index: 9999 !important;
      pointer-events: auto !important;
      isolation: isolate !important;
    }
    .keepsake-reddit-book-btn * {
      pointer-events: none !important;
    }
    .keepsake-reddit-book-btn:hover {
      background: var(--color-neutral-background-hover, rgba(128, 128, 128, 0.22)) !important;
      color: var(--color-neutral-content, #1c1c1c) !important;
    }
    .keepsake-reddit-book-btn.is-saving {
      opacity: 0.7 !important;
      cursor: wait !important;
    }
    .keepsake-reddit-book-btn.is-booked {
      color: #0284c7 !important;
      background: rgba(2, 132, 199, 0.15) !important;
      border-color: rgba(2, 132, 199, 0.3) !important;
    }
    .keepsake-reddit-book-btn svg {
      width: 14px !important;
      height: 14px !important;
      flex-shrink: 0 !important;
      pointer-events: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);
}

function handleBookPost(bookBtn: HTMLButtonElement, post: Element) {
  if (bookBtn.classList.contains('is-booked') || bookBtn.classList.contains('is-saving')) {
    return;
  }

  bookBtn.classList.add('is-saving');
  const labelSpan = bookBtn.querySelector('.keepsake-btn-label');
  if (labelSpan) labelSpan.textContent = 'Saving…';

  // 1. Extract post URL
  const permalink =
    post.getAttribute('permalink') ||
    post.querySelector('a[slot="full-post-link"]')?.getAttribute('href') ||
    post.querySelector('a[data-click-id="body"]')?.getAttribute('href') ||
    post.querySelector('a[href*="/comments/"]')?.getAttribute('href');

  let postUrl = '';
  if (permalink) {
    postUrl = permalink.startsWith('http')
      ? permalink
      : `https://www.reddit.com${permalink.startsWith('/') ? '' : '/'}${permalink}`;
  } else {
    postUrl = window.location.href;
  }

  // 2. Extract post title
  let title =
    post.getAttribute('post-title') ||
    post.querySelector('a[slot="title"]')?.textContent ||
    post.querySelector('h1, h2, h3, a[data-click-id="body"]')?.textContent ||
    '';
  title = cleanRedditTitle(title.trim());

  // 3. Extract subreddit
  const subreddit =
    post.getAttribute('subreddit-prefixed-name')?.replace(/^r\//i, '') ||
    post.querySelector('a[href*="/r/"]')?.textContent?.replace(/^r\//i, '')?.trim();

  // 4. Extract preview/media cover image
  let cover: string | undefined = undefined;
  const contentHref = post.getAttribute('content-href');
  const thumbSrc = post.getAttribute('thumbnail-src');

  if (contentHref && isValidMediaUrl(contentHref)) {
    cover = contentHref;
  } else if (thumbSrc && isValidMediaUrl(thumbSrc)) {
    cover = thumbSrc;
  }

  if (!cover) {
    const player = post.querySelector('shreddit-player') || post.shadowRoot?.querySelector('shreddit-player');
    const poster = player?.getAttribute('poster');
    if (poster && isValidMediaUrl(poster)) {
      cover = poster;
    }
  }

  if (!cover) {
    const img = post.querySelector<HTMLImageElement>(
      'img[src*="preview.redd.it"], img[src*="i.redd.it"], img[src*="external-preview.redd.it"], shreddit-aspect-ratio img, div[data-click-id="media"] img, figure img, [slot="thumbnail"] img'
    ) || post.shadowRoot?.querySelector<HTMLImageElement>('img');
    if (img?.src && isValidMediaUrl(img.src)) {
      cover = img.src;
    }
  }

  if (cover) {
    cover = cover.replace(/&amp;/g, '&');
    if (cover.startsWith('//')) {
      cover = `https:${cover}`;
    }
  }

  // 5. Post type
  const isVideo = post.getAttribute('post-type') === 'video' || !!post.querySelector('shreddit-player, video');
  const isImage = !isVideo && (
    post.getAttribute('post-type') === 'image' ||
    (cover ? (cover.includes('redd.it') || /\.(jpe?g|png|gif|webp)/i.test(cover)) : false)
  );
  const postType = isVideo ? 'video' : (isImage ? 'image' : 'link');

  // Send to background service worker
  chrome.runtime.sendMessage(
    {
      action: 'SAVE_BOOKMARK_FROM_FEED',
      bookmarkData: {
        url: postUrl,
        title: title || 'Reddit Post',
        cover: (cover && !isGenericRedditMedia(cover)) ? cover : undefined,
        tags: subreddit ? [subreddit.toLowerCase()] : [],
        type: postType
      }
    },
    (res) => {
      bookBtn.classList.remove('is-saving');
      if (res && res.success) {
        bookBtn.classList.add('is-booked');
        bookBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="keepsake-btn-label">Booked ✓</span>
        `;
        bookBtn.title = 'Saved to Keepsake ✓';
      } else {
        if (labelSpan) labelSpan.textContent = 'Retry';
      }
    }
  );
}

function getBookButtonFromEvent(e: Event): HTMLButtonElement | null {
  const path = e.composedPath ? e.composedPath() : [];
  for (const el of path) {
    if (el instanceof HTMLElement && el.classList?.contains('keepsake-reddit-book-btn')) {
      return el as HTMLButtonElement;
    }
  }
  if (e.target instanceof HTMLElement) {
    return e.target.closest('.keepsake-reddit-book-btn');
  }
  return null;
}

function findPostElementFromButton(btn: HTMLElement): Element | null {
  const post = btn.closest('shreddit-post, div[data-testid="post-container"], div.thing.entry');
  if (post) return post;

  let current: Node | null = btn;
  while (current) {
    if (current instanceof Element) {
      const tag = current.tagName.toLowerCase();
      if (
        tag === 'shreddit-post' ||
        current.getAttribute('data-testid') === 'post-container' ||
        current.classList.contains('thing')
      ) {
        return current;
      }
    }
    if (current instanceof ShadowRoot) {
      current = current.host;
    } else {
      current = current.parentNode;
    }
  }
  return null;
}

let isGlobalInterceptorAttached = false;
function setupGlobalRedditClickInterceptor() {
  if (isGlobalInterceptorAttached || typeof window === 'undefined') return;
  isGlobalInterceptorAttached = true;

  const intercept = (e: Event) => {
    const btn = getBookButtonFromEvent(e);
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.type === 'click') {
        const post = findPostElementFromButton(btn);
        if (post) {
          handleBookPost(btn, post);
        }
      }
    }
  };

  // Intercept all mouse/pointer events on window capturing phase
  ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((evt) => {
    window.addEventListener(evt, intercept, true);
  });
}

function createBookButton(post: Element): HTMLButtonElement {
  const bookBtn = document.createElement('button');
  bookBtn.type = 'button';
  bookBtn.className = 'keepsake-reddit-book-btn';
  bookBtn.title = 'Save post to Keepsake';
  bookBtn.setAttribute('data-no-route', 'true');
  bookBtn.setAttribute('data-prevent-post-click', 'true');
  bookBtn.setAttribute('data-click-id', 'ignore');
  bookBtn.setAttribute('role', 'button');
  bookBtn.setAttribute('tabindex', '0');

  bookBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
    <span class="keepsake-btn-label">Book</span>
  `;

  const stopAndAct = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type === 'click') {
      handleBookPost(bookBtn, post);
    }
  };

  ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((evt) => {
    bookBtn.addEventListener(evt, stopAndAct, true);
    bookBtn.addEventListener(evt, stopAndAct, false);
  });

  return bookBtn;
}

function attachBookButtonToPost(post: Element): boolean {
  if (post.querySelector('.keepsake-reddit-book-btn')) return true;
  if (post.shadowRoot?.querySelector('.keepsake-reddit-book-btn')) return true;

  const bookBtn = createBookButton(post);

  // 1. Try finding native share element (custom elements in shreddit)
  const shareElement =
    post.querySelector('share-button') ||
    post.querySelector('shreddit-post-share-button') ||
    post.shadowRoot?.querySelector('share-button') ||
    post.shadowRoot?.querySelector('shreddit-post-share-button');

  if (shareElement && shareElement.parentElement) {
    shareElement.parentElement.insertBefore(bookBtn, shareElement.nextSibling);
    return true;
  }

  // 2. Query buttons for share or save
  const buttons = [
    ...Array.from(post.querySelectorAll('button, a')),
    ...(post.shadowRoot ? Array.from(post.shadowRoot.querySelectorAll('button, a')) : [])
  ];

  const shareBtn = buttons.find((b) => {
    const text = b.textContent?.trim().toLowerCase();
    const aria = b.getAttribute('aria-label')?.toLowerCase() || '';
    return text === 'share' || aria.includes('share');
  });

  if (shareBtn && shareBtn.parentElement) {
    shareBtn.parentElement.insertBefore(bookBtn, shareBtn.nextSibling);
    return true;
  }

  const saveBtn = buttons.find((b) => {
    const text = b.textContent?.trim().toLowerCase();
    const aria = b.getAttribute('aria-label')?.toLowerCase() || '';
    return text === 'save' || aria.includes('save post') || aria === 'save';
  });

  if (saveBtn && saveBtn.parentElement) {
    saveBtn.parentElement.insertBefore(bookBtn, saveBtn.nextSibling);
    return true;
  }

  // 3. Overflow menu
  const overflow =
    post.querySelector('shreddit-post-overflow-menu') ||
    post.shadowRoot?.querySelector('shreddit-post-overflow-menu');

  if (overflow && overflow.parentElement) {
    overflow.parentElement.insertBefore(bookBtn, overflow);
    return true;
  }

  // 4. Action row container
  const actionRow =
    post.querySelector('[slot="action-row"]') ||
    post.querySelector('[slot="actions"]') ||
    post.querySelector('[slot="credit-bar"]') ||
    post.querySelector('shreddit-async-loader[bundlename*="action"]') ||
    post.shadowRoot?.querySelector('[slot="action-row"]') ||
    post.shadowRoot?.querySelector('[slot="actions"]');

  if (actionRow) {
    actionRow.appendChild(bookBtn);
    return true;
  }

  // 5. Old reddit buttons list
  const oldButtonsList = post.querySelector('ul.flat-list.buttons');
  if (oldButtonsList) {
    const li = document.createElement('li');
    li.appendChild(bookBtn);
    oldButtonsList.appendChild(li);
    return true;
  }

  // 6. 2018 redesign comments/action bar
  const commentsBtn = post.querySelector('a[data-click-id="comments"], button[data-click-id="comments"]');
  if (commentsBtn && commentsBtn.parentElement) {
    commentsBtn.parentElement.appendChild(bookBtn);
    return true;
  }

  // Not ready yet (post action row hasn't hydrated)
  return false;
}

function injectRedditFeedButtons() {
  if (!window.location.hostname.includes('reddit.com') && window.location.hostname !== 'redd.it') {
    return;
  }

  ensureStyles();
  setupGlobalRedditClickInterceptor();

  // Modern Reddit (shreddit-post)
  const shredditPosts = document.querySelectorAll('shreddit-post');
  shredditPosts.forEach((post) => {
    const hasBtn = !!post.querySelector('.keepsake-reddit-book-btn');
    if (!hasBtn) {
      post.removeAttribute('data-keepsake-injected');
      const injected = attachBookButtonToPost(post);
      if (injected) {
        post.setAttribute('data-keepsake-injected', 'true');
      }
    }
  });

  // 2018 Redesign posts
  const redesignPosts = document.querySelectorAll('div[data-testid="post-container"]');
  redesignPosts.forEach((post) => {
    const hasBtn = !!post.querySelector('.keepsake-reddit-book-btn');
    if (!hasBtn) {
      post.removeAttribute('data-keepsake-injected');
      const injected = attachBookButtonToPost(post);
      if (injected) {
        post.setAttribute('data-keepsake-injected', 'true');
      }
    }
  });

  // Old Reddit posts
  const oldPosts = document.querySelectorAll('div.thing.entry');
  oldPosts.forEach((post) => {
    const hasBtn = !!post.querySelector('.keepsake-reddit-book-btn');
    if (!hasBtn) {
      post.removeAttribute('data-keepsake-injected');
      const injected = attachBookButtonToPost(post);
      if (injected) {
        post.setAttribute('data-keepsake-injected', 'true');
      }
    }
  });
}

// Initialize feed observer on reddit.com
if (typeof window !== 'undefined' && (window.location.hostname.includes('reddit.com') || window.location.hostname === 'redd.it')) {
  setupGlobalRedditClickInterceptor();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectRedditFeedButtons();
    });
  } else {
    injectRedditFeedButtons();
  }

  let debounceTimer: any = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      injectRedditFeedButtons();
    }, 150);
  });

  const targetRoot = document.body || document.documentElement;
  if (targetRoot) {
    observer.observe(targetRoot, {
      childList: true,
      subtree: true
    });
  }
}
