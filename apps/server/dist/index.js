import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { authRouter } from './auth.js';
import { scrapeUrl } from './scraper.js';
import { serverStore } from './store.js';
import { exportToNetscapeHtml, parseNetscapeHtml, extractDomain, getFaviconUrl } from '@keepsake/shared';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
// Enable CORS for web app, extensions, and mobile clients
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'Keepsake Server',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});
// Authentication Routes
app.use('/api/auth', authRouter);
// Scraper Route
app.get('/api/scrape', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing "url" query parameter' });
    }
    try {
        const metadata = await scrapeUrl(targetUrl);
        return res.json(metadata);
    }
    catch (err) {
        return res.status(500).json({
            error: 'Failed to scrape URL',
            message: err.message
        });
    }
});
// ==========================================
// Full Store Sync Endpoints (CRDT LWW)
// ==========================================
app.get('/api/sync', (req, res) => {
    res.json({
        success: true,
        store: serverStore.getStore()
    });
});
app.post('/api/sync', (req, res) => {
    const incomingStore = req.body.store || req.body;
    if (!incomingStore || !Array.isArray(incomingStore.bookmarks)) {
        return res.status(400).json({ error: 'Invalid store payload for sync' });
    }
    const merged = serverStore.merge(incomingStore);
    return res.json({
        success: true,
        store: merged
    });
});
// ==========================================
// Bookmarks REST API
// ==========================================
app.get('/api/bookmarks', (req, res) => {
    const { collectionId, isTrash, search, url } = req.query;
    const bookmarks = serverStore.listBookmarks({
        collectionId: collectionId,
        isTrash: isTrash,
        search: search,
        url: url
    });
    res.json({
        bookmarks,
        total: bookmarks.length
    });
});
app.get('/api/bookmarks/:id', (req, res) => {
    const bookmark = serverStore.getBookmark(req.params.id);
    if (!bookmark) {
        return res.status(404).json({ error: 'Bookmark not found' });
    }
    return res.json({ bookmark });
});
app.post('/api/bookmarks', async (req, res) => {
    const { id, url, title, description, excerpt, note, domain, favicon, cover, collectionId, tags, isFavorite, isTrash, type, createdAt, readerContent } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Missing required field: "url"' });
    }
    const saved = serverStore.addOrUpdateBookmark({
        id,
        url,
        title,
        description,
        excerpt,
        note,
        domain,
        favicon,
        cover,
        collectionId,
        tags,
        isFavorite,
        isTrash,
        type,
        createdAt,
        readerContent
    });
    // Background auto-enrichment if metadata is sparse
    if ((!saved.cover || !saved.description) && saved.url.startsWith('http')) {
        scrapeUrl(saved.url)
            .then((meta) => {
            if (meta && (meta.cover || meta.description || meta.title)) {
                serverStore.addOrUpdateBookmark({
                    id: saved.id,
                    url: saved.url,
                    title: saved.title || meta.title,
                    description: saved.description || meta.description,
                    cover: saved.cover || meta.cover,
                    favicon: saved.favicon || meta.favicon,
                    type: saved.type === 'link' ? meta.type : saved.type,
                    readerContent: meta.readerContent
                });
            }
        })
            .catch(() => { });
    }
    return res.status(201).json({
        success: true,
        bookmark: saved
    });
});
app.put('/api/bookmarks/:id', (req, res) => {
    const existing = serverStore.getBookmark(req.params.id);
    if (!existing) {
        return res.status(404).json({ error: 'Bookmark not found' });
    }
    const updated = serverStore.addOrUpdateBookmark({
        ...req.body,
        id: req.params.id,
        url: req.body.url || existing.url
    });
    return res.json({
        success: true,
        bookmark: updated
    });
});
app.delete('/api/bookmarks/:id', (req, res) => {
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
app.get('/api/collections', (req, res) => {
    const collections = serverStore.listCollections();
    res.json({
        collections
    });
});
app.get('/api/collections/:id', (req, res) => {
    const collection = serverStore.getCollection(req.params.id);
    if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
    }
    return res.json({ collection });
});
app.post('/api/collections', (req, res) => {
    const { title, description, icon, color, defaultViewMode, sortOrder, isSystem, id } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'Missing required field: "title"' });
    }
    const collection = serverStore.addOrUpdateCollection({
        id,
        title,
        description,
        icon,
        color,
        defaultViewMode,
        sortOrder,
        isSystem
    });
    return res.status(201).json({
        success: true,
        collection
    });
});
app.put('/api/collections/:id', (req, res) => {
    const existing = serverStore.getCollection(req.params.id);
    if (!existing) {
        return res.status(404).json({ error: 'Collection not found' });
    }
    const updated = serverStore.addOrUpdateCollection({
        ...req.body,
        id: req.params.id,
        title: req.body.title || existing.title
    });
    return res.json({
        success: true,
        collection: updated
    });
});
app.delete('/api/collections/:id', (req, res) => {
    const success = serverStore.deleteCollection(req.params.id);
    if (!success) {
        return res.status(400).json({ error: 'Cannot delete collection (or not found)' });
    }
    return res.json({ success: true });
});
// Bookmark Import from Netscape HTML / JSON
app.post('/api/import', (req, res) => {
    const { content, format } = req.body;
    if (!content) {
        return res.status(400).json({ error: 'Missing content to import' });
    }
    try {
        if (format === 'json') {
            const parsed = typeof content === 'string' ? JSON.parse(content) : content;
            if (parsed.bookmarks || parsed.collections) {
                const merged = serverStore.merge(parsed);
                return res.json({
                    success: true,
                    bookmarks: merged.bookmarks,
                    collections: merged.collections,
                    importedCount: parsed.bookmarks ? parsed.bookmarks.length : 0
                });
            }
            return res.status(400).json({ error: 'Invalid JSON backup format' });
        }
        // Default to Netscape HTML format
        const parsedItems = parseNetscapeHtml(content);
        const collectionsMap = new Map();
        const existingCols = serverStore.listCollections();
        existingCols.forEach((c) => collectionsMap.set(c.title.toLowerCase(), c));
        const bookmarks = [];
        const now = new Date().toISOString();
        for (const item of parsedItems) {
            const colName = item.collectionName || 'Unsorted';
            const lower = colName.toLowerCase();
            let targetColId = 'unsorted';
            if (colName !== 'Unsorted') {
                if (collectionsMap.has(lower)) {
                    targetColId = collectionsMap.get(lower).id;
                }
                else {
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
                isFavorite: false,
                isTrash: false,
                type: 'link',
                createdAt: item.createdAt || now
            });
            bookmarks.push(savedBm);
        }
        return res.json({
            success: true,
            bookmarks,
            collections: serverStore.listCollections(),
            importedCount: bookmarks.length
        });
    }
    catch (err) {
        return res.status(400).json({ error: `Import failed: ${err.message}` });
    }
});
// Bookmark Export to HTML / JSON
app.post('/api/export/html', (req, res) => {
    const { bookmarks, collections } = req.body;
    const list = bookmarks && Array.isArray(bookmarks) ? bookmarks : serverStore.listBookmarks({ isTrash: false });
    const cols = collections && Array.isArray(collections) ? collections : serverStore.listCollections();
    const html = exportToNetscapeHtml(list, cols);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="keepsake-bookmarks.html"');
    return res.send(html);
});
app.post('/api/export/json', (req, res) => {
    const store = serverStore.getStore();
    const data = {
        app: 'Keepsake',
        version: store.version,
        schemaVersion: store.schemaVersion,
        exportedAt: new Date().toISOString(),
        collections: store.collections,
        bookmarks: store.bookmarks,
        tombstones: store.tombstones
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="keepsake-backup.json"');
    return res.send(JSON.stringify(data, null, 2));
});
// Serve frontend static files in production if built
const webDistPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(webDistPath, 'index.html'));
    });
}
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});
app.listen(PORT, () => {
    console.log(`✨ Keepsake Server running on port ${PORT}`);
    console.log(`👉 http://localhost:${PORT}`);
});
