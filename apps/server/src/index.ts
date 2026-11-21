import './env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createAuthRouter } from './auth.js';
import { scrapeUrl } from './scraper.js';
import { serverStore, DATA_DIR } from './store.js';
import { SessionStore, parseAllowedEmails } from './sessions.js';
import { hasBookmarkConflict } from './conflicts.js';
import { createApiAuth } from './apiAuth.js';
import { createRateLimiter } from './rateLimit.js';
import {
  exportToNetscapeHtml,
  parseNetscapeHtml,
  extractDomain,
  getFaviconUrl,
  isGenericRedditMedia,
  isRedditUrl,
  cleanRedditTitle,
  isSparseTitle,
  Bookmark,
  Collection,
  CollectionInput,
  BookmarkInput,
  KeepsakeDataStore,
  canSetCollectionParent,
  sanitizeBookmarkInput,
  sanitizeCollectionInput
} from '@keepsake/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers. The web app is served from this origin, so scripts are limited to it; the
// sign-in result pages use a per-response nonce for their one inline script. Styles allow
// inline attributes because React sets some. Google Drive sync runs in the browser, hence googleapis.com.
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: http: data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.googleapis.com https://oauth2.googleapis.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'"
  ].join('; '));
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Browsers only need CORS when a page on another origin calls the API. The web app is served
// from this server, and the extension and Android app are not subject to CORS, so it is off
// unless CORS_ORIGIN lists the origins to allow ("*" allows any; requests still need a session).
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
if (configuredOrigins.length > 0) {
  app.use(
    cors({
      origin: configuredOrigins.includes('*') ? '*' : configuredOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    })
  );
}

// The public sign-in routes are rate limited.
app.use('/api/auth', createRateLimiter({ windowMs: 60_000, max: 60 }));

// Clients authenticate by signing in with Google. The server only accepts the
// accounts listed in KEEPSAKE_ALLOWED_EMAILS and mints a per-device session
// token, so there is no shared secret to copy between the server and clients.
// KEEPSAKE_API_TOKEN is an optional extra credential for scripts.
const allowedEmails = parseAllowedEmails(process.env.KEEPSAKE_ALLOWED_EMAILS);
if (allowedEmails.length === 0) {
  throw new Error('KEEPSAKE_ALLOWED_EMAILS must list the Google account email(s) allowed to use this server');
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[Server] Google OAuth is not configured, so nobody can sign in yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}
const sessions = new SessionStore(path.join(DATA_DIR, 'sessions.json'));
// Dropping an address from the allow-list ends that account's sessions.
sessions.revokeWhere((email) => allowedEmails.includes(email));

// OAuth and the health probe remain public; all library and scraping APIs
// require a signed-in session.
app.use('/api', createApiAuth({ sessions, legacyToken: process.env.KEEPSAKE_API_TOKEN || undefined }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Express 4 does not catch rejections from async handlers; route them to the error handler
// instead of letting an unexpected throw take the process down.
const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

// Version and build, read once at startup. The commit comes from GIT_COMMIT (Docker builds) or the
// checkout the server runs from; it is simply omitted when neither is available.
const require = createRequire(import.meta.url);
const packageVersion: string = (() => { try { return require('../package.json').version; } catch { return 'unknown'; } })();
const buildCommit: string | undefined = (() => {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT.slice(0, 12);
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined; } catch { return undefined; }
})();

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'Keepsake Server',
    version: packageVersion,
    commit: buildCommit,
    capabilities: { conditionalBookmarkWrites: true, captureMode: true, syncRevisions: true, readerOnDemand: true, devices: true },
    timestamp: new Date().toISOString()
  });
});

// Authentication Routes
app.use('/api/auth', createAuthRouter({ sessions, allowedEmails }));

// Scraper Route
app.get('/api/scrape', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const metadata = await scrapeUrl(targetUrl);
    return res.json(metadata);
  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to scrape URL',
      message: err.message
    });
  }
});

// ==========================================
// Full Store Sync Endpoints (CRDT LWW)
// ==========================================
// `?readers=0` leaves article text out (bookmarks get `hasReader` instead); it is fetched per
// bookmark from /api/bookmarks/:id/reader. The revision lets clients skip unchanged downloads.
const withoutReaders = (store: KeepsakeDataStore): KeepsakeDataStore => ({
  ...store,
  bookmarks: store.bookmarks.map((bookmark) => {
    if (!bookmark.readerContent) return bookmark;
    const { readerContent, ...rest } = bookmark;
    return { ...rest, hasReader: true };
  })
});
const syncEtag = (req: Request) => `W/"${serverStore.getRevision()}${req.query.readers === '0' ? '-r0' : ''}"`;

app.get('/api/sync', (req: Request, res: Response) => {
  const etag = syncEtag(req);
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  if (req.get('if-none-match') === etag) {
    return res.status(304).end();
  }
  const store = serverStore.getStore();
  return res.json({
    success: true,
    store: req.query.readers === '0' ? withoutReaders(store) : store
  });
});

app.post('/api/sync', (req: Request, res: Response) => {
  const incomingStore: unknown = req.body?.store || req.body;
  const merged = serverStore.merge(incomingStore);
  if (!merged) {
    return res.status(400).json({ error: 'Invalid store payload for sync' });
  }
  res.setHeader('ETag', syncEtag(req));
  res.setHeader('Cache-Control', 'no-cache');
  return res.json({
    success: true,
    store: req.query.readers === '0' ? withoutReaders(merged) : merged
  });
});

// ==========================================
// Bookmarks REST API
// ==========================================
app.get('/api/bookmarks', (req: Request, res: Response) => {
  const { collectionId, isTrash, isDone, search, url } = req.query;
  const bookmarks = serverStore.listBookmarks({
    collectionId: collectionId as string,
    isTrash: isTrash as string | undefined,
    isDone: isDone as string | undefined,
    search: search as string,
    url: url as string
  });

  // Article text is large; list responses omit it unless asked (?include=reader).
  const includeReader = req.query.include === 'reader';
  res.json({
    bookmarks: includeReader ? bookmarks : withoutReaders({ ...serverStore.getStore(), bookmarks }).bookmarks,
    total: bookmarks.length
  });
});

// Tags in use (not counting the trash), most used first. Powers tag suggestions in the clients.
app.get('/api/tags', (req: Request, res: Response) => {
  const counts = new Map<string, number>();
  for (const bookmark of serverStore.getStore().bookmarks) {
    if (bookmark.isTrash) continue;
    for (const tag of bookmark.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  res.json({ tags: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) });
});

app.get('/api/bookmarks/:id/reader', (req: Request, res: Response) => {
  const bookmark = serverStore.getBookmark(req.params.id);
  if (!bookmark?.readerContent) {
    return res.status(404).json({ error: 'No saved article for this bookmark' });
  }
  return res.json({ readerContent: bookmark.readerContent });
});

app.get('/api/bookmarks/:id', (req: Request, res: Response) => {
  const bookmark = serverStore.getBookmark(req.params.id);
  if (!bookmark) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }
  return res.json({ bookmark });
});

app.post('/api/bookmarks', asyncRoute(async (req: Request, res: Response) => {
  const parsed = sanitizeBookmarkInput(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const input = parsed.value as BookmarkInput & { url: string };
  const { id, url } = input;
  const ifUnmodifiedSince = req.body.ifUnmodifiedSince;
  // 'capture' (quick-saves) fills in missing metadata of an existing bookmark
  // without touching its collection, tags, note or flags.
  const mode = req.body.mode === 'capture' ? 'capture' : 'update';

  // Queued offline captures must not overwrite changes made since the client
  // last saw this bookmark. The comparison and write run synchronously.
  if (Object.prototype.hasOwnProperty.call(req.body, 'ifUnmodifiedSince')) {
    if (ifUnmodifiedSince !== null && typeof ifUnmodifiedSince !== 'string') return res.status(400).json({ error: 'Invalid conflict precondition' });
    const existing = (id && serverStore.getBookmark(id)) || serverStore.listBookmarks({ url }).find((bookmark) => !bookmark.isTrash);
    if (hasBookmarkConflict(existing || undefined, ifUnmodifiedSince)) {
      return res.status(409).json({ error: 'Bookmark changed since this save was queued', bookmark: existing || null });
    }
  }

  const saved = serverStore.addOrUpdateBookmark(input, { mode });

  // Background auto-enrichment if metadata is sparse or cover is missing/generic
  const sparseTitle = isSparseTitle(saved.title, saved.domain, saved.url);
  const needsCover = !saved.cover || isGenericRedditMedia(saved.cover);
  const isShortReddit = isRedditUrl(saved.url) && (saved.url.includes('/s/') || saved.domain === 'redd.it');
  const needsEnrichment = needsCover || !saved.description || sparseTitle || isShortReddit;

  if (needsEnrichment && saved.url.startsWith('http')) {
    scrapeUrl(saved.url)
      .then((meta) => {
        if (meta && (meta.cover || meta.description || meta.title || meta.url)) {
          const current = serverStore.getBookmark(saved.id);
          if (!current || current.isTrash || current.url !== saved.url) return;
          // If we already have a valid non-generic cover, preserve it!
          const resolvedCover = (!current.cover || isGenericRedditMedia(current.cover)) && meta.cover && !isGenericRedditMedia(meta.cover) ? meta.cover : current.cover;

          // Preserve user-specified custom title, but overwrite sparse/generic domain titles
          const resolvedTitle = isSparseTitle(current.title, current.domain, current.url) ? (meta.title || current.title) : current.title;

          // Update tags with subreddit tag if no tags were provided
          const existingTags = Array.isArray(current.tags) ? current.tags : [];
          let updatedTags = existingTags;
          if (existingTags.length === 0 && meta.siteName && meta.siteName.startsWith('r/')) {
            const subTag = meta.siteName.slice(2).trim().toLowerCase();
            if (subTag) {
              updatedTags = [subTag];
            }
          }

          // Canonical URL: if scrapeUrl resolved a redirect (e.g. from /s/), update url to canonical
          const resolvedUrl = (meta.url && meta.url.startsWith('http')) ? meta.url : saved.url;
          const resolvedDomain = meta.domain || saved.domain;

          serverStore.addOrUpdateBookmark({
            id: saved.id,
            url: resolvedUrl,
            domain: resolvedDomain,
            title: resolvedTitle,
            description: current.description || meta.description,
            cover: resolvedCover,
            favicon: current.favicon || meta.favicon,
            type: current.type === 'link' && meta.type ? meta.type : current.type,
            tags: updatedTags,
            readerContent: current.readerContent || meta.readerContent
          });
        }
      })
      .catch((err) => {
        console.error('[Server] Background auto-enrichment failed for', saved.url, err);
      });
  }

  return res.status(201).json({
    success: true,
    bookmark: saved
  });
}));

app.put('/api/bookmarks/:id', (req: Request, res: Response) => {
  const existing = serverStore.getBookmark(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }

  const parsed = sanitizeBookmarkInput(req.body, { partial: true });
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const updated = serverStore.addOrUpdateBookmark({
    ...existing,
    ...parsed.value,
    id: req.params.id,
    url: parsed.value.url || existing.url
  });

  return res.json({
    success: true,
    bookmark: updated
  });
});

app.delete('/api/bookmarks/:id', (req: Request, res: Response) => {
  const isPermanent = req.query.permanent === 'true';
  const success = serverStore.deleteBookmark(req.params.id, isPermanent);
  if (!success) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }
  return res.json({ success: true, permanent: isPermanent });
});

// ==========================================
// Collections REST API
// ==========================================
app.get('/api/collections', (req: Request, res: Response) => {
  const collections = serverStore.listCollections();
  res.json({
    collections
  });
});

app.get('/api/collections/:id', (req: Request, res: Response) => {
  const collection = serverStore.getCollection(req.params.id);
  if (!collection) {
    return res.status(404).json({ error: 'Collection not found' });
  }
  return res.json({ collection });
});

app.post('/api/collections', (req: Request, res: Response) => {
  const parsed = sanitizeCollectionInput(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const { title, description, icon, color, defaultViewMode, sortOrder, isSystem, id, parentId } = parsed.value as CollectionInput & { title: string };
  if (parentId !== undefined && parentId !== null && (typeof parentId !== 'string' || !canSetCollectionParent(serverStore.listCollections(), id, parentId))) return res.status(400).json({ error: 'Invalid parent collection' });

  const collection = serverStore.addOrUpdateCollection({
    id,
    title,
    description,
    icon,
    color,
    defaultViewMode,
    sortOrder,
    isSystem,
    parentId
  });

  return res.status(201).json({
    success: true,
    collection
  });
});

app.put('/api/collections/reorder', (req: Request, res: Response) => {
  const { collectionIds } = req.body;
  if (!Array.isArray(collectionIds)) {
    return res.status(400).json({ error: 'Missing or invalid collectionIds array' });
  }
  const collections = serverStore.reorderCollections(collectionIds);
  return res.json({ success: true, collections });
});

app.put('/api/collections/:id', (req: Request, res: Response) => {
  const existing = serverStore.getCollection(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Collection not found' });
  }

  const parsed = sanitizeCollectionInput(req.body, { partial: true });
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const changes = parsed.value;
  if (changes.parentId !== undefined && changes.parentId !== null && !canSetCollectionParent(serverStore.listCollections(), req.params.id, changes.parentId)) return res.status(400).json({ error: 'Invalid parent collection' });

  const updated = serverStore.addOrUpdateCollection({
    ...changes,
    id: req.params.id,
    title: changes.title || existing.title
  });

  return res.json({
    success: true,
    collection: updated
  });
});

app.delete('/api/collections/:id', (req: Request, res: Response) => {
  const success = serverStore.deleteCollection(req.params.id);
  if (!success) {
    return res.status(400).json({ error: 'Cannot delete collection (or not found)' });
  }
  return res.json({ success: true });
});

// Bookmark Import from Netscape HTML / JSON
app.post('/api/import', (req: Request, res: Response) => {
  const { content, format } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Missing content to import' });
  }

  try {
    if (format === 'json') {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      const merged = serverStore.merge(parsed);
      if (!merged) {
        return res.status(400).json({ error: 'Invalid JSON backup format' });
      }
      return res.json({
        success: true,
        bookmarks: merged.bookmarks,
        collections: merged.collections,
        importedCount: Array.isArray(parsed.bookmarks) ? parsed.bookmarks.length : 0
      });
    }

    // Default to Netscape HTML format
    const parsedItems = parseNetscapeHtml(content);
    const collectionsMap = new Map<string, Collection>();
    const existingCols = serverStore.listCollections();
    existingCols.forEach((c) => collectionsMap.set(c.title.toLowerCase(), c));

    const bookmarks: Bookmark[] = [];
    const now = new Date().toISOString();

    // One write to disk for the whole import instead of one per bookmark. Existing
    // bookmarks are only enriched: re-importing an export must not reset their
    // collection, tags or favorites.
    serverStore.batch(() => {
    for (const item of parsedItems) {
      const colName = item.collectionName || 'Unsorted';
      const lower = colName.toLowerCase();
      let targetColId = 'unsorted';

      if (colName !== 'Unsorted') {
        if (collectionsMap.has(lower)) {
          targetColId = collectionsMap.get(lower)!.id;
        } else {
          const newCol = serverStore.addOrUpdateCollection({
            title: colName,
            isSystem: false
          });
          collectionsMap.set(lower, newCol);
          targetColId = newCol.id;
        }
      }

      const domain = extractDomain(item.url);
      const savedBm = serverStore.addOrUpdateBookmark({
        url: item.url,
        title: item.title || domain,
        description: item.description || '',
        domain,
        favicon: getFaviconUrl(domain),
        collectionId: targetColId,
        tags: item.tags || [],
        type: 'link',
        createdAt: item.createdAt || now
      }, { mode: 'capture' });
      bookmarks.push(savedBm);
    }
    });

    return res.json({
      success: true,
      bookmarks,
      collections: serverStore.listCollections(),
      importedCount: bookmarks.length
    });
  } catch (err: any) {
    return res.status(400).json({ error: `Import failed: ${err.message}` });
  }
});

// Bookmark Export to HTML / JSON
app.post('/api/export/html', (req: Request, res: Response) => {
  const { bookmarks, collections } = req.body;
  const list = bookmarks && Array.isArray(bookmarks) ? bookmarks : serverStore.listBookmarks({ isTrash: false });
  const cols = collections && Array.isArray(collections) ? collections : serverStore.listCollections();

  const html = exportToNetscapeHtml(list, cols);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="keepsake-bookmarks.html"');
  return res.send(html);
});

app.post('/api/export/json', (req: Request, res: Response) => {
  const store = serverStore.getStore();
  const data = {
    app: 'Keepsake',
    ...store,
    exportedAt: new Date().toISOString()
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="keepsake-backup.json"');
  return res.send(JSON.stringify(data, null, 2));
});

// Serve frontend static files in production if built
const webDistPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Body-parser problems are the client's fault; everything else is logged
  // here and answered without internal details.
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (err?.type === 'entity.parse.failed' || err?.type === 'encoding.unsupported' || err?.type === 'charset.unsupported') return res.status(400).json({ error: 'Request body could not be parsed' });
  console.error('Server error:', err);
  return res.status(500).json({ error: 'Internal Server Error' });
});

export { app };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(PORT, () => {
    console.log(`✨ Keepsake Server running on port ${PORT}`);
    console.log(`👉 http://localhost:${PORT}`);
  });
}
