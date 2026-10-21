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
      const ogMeta = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const redditMedia =
        shredditPost?.getAttribute('content-href') ||
        shredditPost?.getAttribute('thumbnail-src') ||
        document.querySelector('shreddit-aspect-ratio img')?.getAttribute('src') ||
        document.querySelector('img[src*="preview.redd.it"]')?.getAttribute('src') ||
        document.querySelector('img[src*="i.redd.it"]')?.getAttribute('src') ||
        document.querySelector('img[src*="external-preview.redd.it"]')?.getAttribute('src') ||
        (ogMeta && !ogMeta.includes('redditstatic.com') ? ogMeta : null) ||
        document.querySelector('shreddit-player')?.getAttribute('poster') ||
        document.querySelector('img[alt="Post image"]')?.getAttribute('src') ||
        document.querySelector('div[data-click-id="media"] img')?.getAttribute('src') ||
        document.querySelector('figure img')?.getAttribute('src');

      if (redditMedia && (redditMedia.startsWith('http') || redditMedia.startsWith('//'))) {
        ogImage = (redditMedia.startsWith('//') ? `https:${redditMedia}` : redditMedia).replace(/&amp;/g, '&');
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

// ==========================================
// Reddit Feed "Book" Quick-Action Injection
// ==========================================
function injectRedditFeedButtons() {
  if (!window.location.hostname.includes('reddit.com') && window.location.hostname !== 'redd.it') {
    return;
  }

  // Ensure Keepsake button styles exist in head
  if (!document.getElementById('keepsake-reddit-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'keepsake-reddit-styles';
    styleEl.textContent = `
      .keepsake-reddit-book-btn {
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        height: 32px !important;
        padding: 0 10px !important;
        border-radius: 9999px !important;
        border: 1px solid transparent !important;
        background: transparent !important;
        color: var(--color-neutral-content-weak, #878a8c) !important;
        font-family: inherit !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.15s ease !important;
        margin: 0 2px !important;
        user-select: none !important;
        line-height: 1 !important;
        vertical-align: middle !important;
      }
      .keepsake-reddit-book-btn:hover {
        background: rgba(128, 128, 128, 0.15) !important;
        color: var(--color-neutral-content, #d7dadc) !important;
      }
      .keepsake-reddit-book-btn.is-saving {
        opacity: 0.65 !important;
        cursor: wait !important;
      }
      .keepsake-reddit-book-btn.is-booked {
        color: #38bdf8 !important;
        background: rgba(56, 189, 248, 0.12) !important;
        border-color: rgba(56, 189, 248, 0.3) !important;
      }
      .keepsake-reddit-book-btn svg {
        width: 14px !important;
        height: 14px !important;
        flex-shrink: 0 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  // 1. Modern Reddit (shreddit-post)
  const shredditPosts = document.querySelectorAll('shreddit-post:not([data-keepsake-injected])');
  shredditPosts.forEach((post) => {
    post.setAttribute('data-keepsake-injected', 'true');
    attachBookButtonToPost(post);
  });

  // 2. 2018 Redesign posts
  const redesignPosts = document.querySelectorAll('div[data-testid="post-container"]:not([data-keepsake-injected])');
  redesignPosts.forEach((post) => {
    post.setAttribute('data-keepsake-injected', 'true');
    attachBookButtonToPost(post);
  });

  // 3. Old Reddit posts
  const oldPosts = document.querySelectorAll('div.thing.entry:not([data-keepsake-injected])');
  oldPosts.forEach((post) => {
    post.setAttribute('data-keepsake-injected', 'true');
    attachBookButtonToPost(post);
  });
}

function attachBookButtonToPost(post: Element) {
  if (post.querySelector('.keepsake-reddit-book-btn')) return;

  const bookBtn = document.createElement('button');
  bookBtn.type = 'button';
  bookBtn.className = 'keepsake-reddit-book-btn';
  bookBtn.title = 'Save post to Keepsake';
  bookBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
    <span class="keepsake-btn-label">Book</span>
  `;

  bookBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

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
      postUrl = permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`;
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
    const ogMeta = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const rawCover =
      post.getAttribute('content-href') ||
      post.getAttribute('thumbnail-src') ||
      post.querySelector('shreddit-aspect-ratio img')?.getAttribute('src') ||
      post.querySelector('img[src*="preview.redd.it"]')?.getAttribute('src') ||
      post.querySelector('img[src*="i.redd.it"]')?.getAttribute('src') ||
      post.querySelector('img[src*="external-preview.redd.it"]')?.getAttribute('src') ||
      post.querySelector('shreddit-player')?.getAttribute('poster') ||
      post.querySelector('div[data-click-id="media"] img')?.getAttribute('src') ||
      post.querySelector('figure img')?.getAttribute('src') ||
      (ogMeta && !ogMeta.includes('redditstatic.com') ? ogMeta : null);

    let cover: string | undefined = undefined;
    if (rawCover && (rawCover.startsWith('http') || rawCover.startsWith('//'))) {
      cover = (rawCover.startsWith('//') ? `https:${rawCover}` : rawCover).replace(/&amp;/g, '&');
    }

    // 5. Post type
    const isVideo = post.getAttribute('post-type') === 'video' || !!post.querySelector('shreddit-player, video');
    const isImage = !isVideo && (post.getAttribute('post-type') === 'image' || (cover && (cover.includes('i.redd.it') || cover.includes('preview.redd.it'))));
    const postType = isVideo ? 'video' : (isImage ? 'image' : 'link');

    // Send to background service worker
    chrome.runtime.sendMessage(
      {
        action: 'SAVE_BOOKMARK_FROM_FEED',
        bookmarkData: {
          url: postUrl,
          title: title || 'Reddit Post',
          cover,
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
  });

  // Insertion strategy:
  // Find action buttons (Save, Share, Hide, Overflow)
  const buttons = Array.from(post.querySelectorAll('button, a'));
  const saveBtn = buttons.find((b) => {
    const text = b.textContent?.trim().toLowerCase();
    const aria = b.getAttribute('aria-label')?.toLowerCase() || '';
    return text === 'save' || aria.includes('save post') || aria === 'save';
  });

  const shareBtn = buttons.find((b) => {
    const text = b.textContent?.trim().toLowerCase();
    const aria = b.getAttribute('aria-label')?.toLowerCase() || '';
    return text === 'share' || aria.includes('share');
  });

  const overflow = post.querySelector('shreddit-post-overflow-menu, share-button');
  const actionSlot = post.querySelector('[slot="actions"], [slot="credit-bar"], [slot="action-row"], shreddit-async-loader[bundlename*="action"]');
  const oldButtonsList = post.querySelector('ul.flat-list.buttons');

  if (saveBtn && saveBtn.parentElement) {
    saveBtn.parentElement.insertBefore(bookBtn, saveBtn.nextSibling);
  } else if (shareBtn && shareBtn.parentElement) {
    shareBtn.parentElement.insertBefore(bookBtn, shareBtn.nextSibling);
  } else if (overflow && overflow.parentElement) {
    overflow.parentElement.insertBefore(bookBtn, overflow);
  } else if (oldButtonsList) {
    const li = document.createElement('li');
    li.appendChild(bookBtn);
    oldButtonsList.appendChild(li);
  } else if (actionSlot) {
    actionSlot.appendChild(bookBtn);
  }
}

// Initialize feed observer on reddit.com
if (typeof window !== 'undefined' && (window.location.hostname.includes('reddit.com') || window.location.hostname === 'redd.it')) {
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
