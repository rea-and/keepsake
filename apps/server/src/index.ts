import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { authRouter } from './auth.js';
import { scrapeUrl } from './scraper.js';
import {
  exportToNetscapeHtml,
  parseNetscapeHtml,
  extractDomain,
  getFaviconUrl,
  Bookmark,
  Collection
} from '@keepsake/shared';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for web app, extensions, and mobile clients
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
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

// Bookmark Import from Netscape HTML / JSON
app.post('/api/import', (req: Request, res: Response) => {
  const { content, format } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Missing content to import' });
  }

  try {
    if (format === 'json') {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      return res.json({
        success: true,
        bookmarks: parsed.bookmarks || [],
        collections: parsed.collections || []
      });
    }

    // Default to Netscape HTML format
    const parsedItems = parseNetscapeHtml(content);
    const collectionsMap = new Map<string, Collection>();
    const bookmarks: Bookmark[] = [];
    const now = new Date().toISOString();

    for (const item of parsedItems) {
      const colName = item.collectionName || 'Unsorted';
      let colId = colName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      if (colName === 'Unsorted') colId = 'unsorted';

      if (!collectionsMap.has(colId)) {
        collectionsMap.set(colId, {
          id: colId,
          title: colName,
          sortOrder: collectionsMap.size,
          isSystem: colId === 'unsorted',
          createdAt: now,
          updatedAt: now
        });
      }

      const domain = extractDomain(item.url);
      bookmarks.push({
        id: 'bm_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
        url: item.url,
        title: item.title || domain,
        description: item.description || '',
        domain,
        favicon: getFaviconUrl(domain),
        collectionId: colId,
        tags: item.tags || [],
        isFavorite: false,
        isTrash: false,
        type: 'link',
        createdAt: item.createdAt || now,
        updatedAt: item.createdAt || now
      });
    }

    return res.json({
      success: true,
      bookmarks,
      collections: Array.from(collectionsMap.values()),
      importedCount: bookmarks.length
    });
  } catch (err: any) {
    return res.status(400).json({ error: `Import failed: ${err.message}` });
  }
});

// Bookmark Export to HTML / JSON
app.post('/api/export/html', (req: Request, res: Response) => {
  const { bookmarks, collections } = req.body;
  if (!bookmarks || !Array.isArray(bookmarks)) {
    return res.status(400).json({ error: 'Invalid bookmarks array' });
  }

  const html = exportToNetscapeHtml(bookmarks, collections || []);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="keepsake-bookmarks.html"');
  return res.send(html);
});

app.post('/api/export/json', (req: Request, res: Response) => {
  const { bookmarks, collections, tombstones } = req.body;
  const data = {
    app: 'Keepsake',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: collections || [],
    bookmarks: bookmarks || [],
    tombstones: tombstones || []
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
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`✨ Keepsake Server running on port ${PORT}`);
  console.log(`👉 http://localhost:${PORT}`);
});
