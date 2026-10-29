import React, { useState, useEffect, useRef } from 'react';
import { useDialog } from './useDialog';
import {
  Bookmark,
  Collection,
  BookmarkType,
  extractDomain,
  getFaviconUrl,
  normalizeUrl,
  isSparseTitle,
  flattenCollections,
  getYouTubeThumbnail
} from '@keepsake/shared';
import { X, Loader2, Sparkles, Star, Tag as TagIcon, Folder, Link as LinkIcon, CheckCircle2 } from 'lucide-react';

interface BookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  bookmarkToEdit?: Bookmark | null;
  collections: Collection[];
  availableTags: Array<{ name: string; count: number }>;
  existingBookmarks: Bookmark[];
  onEditExisting: (bookmark: Bookmark) => void;
  onCreateCollection: (title: string) => Collection;
  defaultCollectionId?: string;
}

export const BookmarkModal: React.FC<BookmarkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  bookmarkToEdit,
  collections,
  availableTags,
  existingBookmarks,
  onEditExisting,
  onCreateCollection,
  defaultCollectionId
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [cover, setCover] = useState('');
  const [favicon, setFavicon] = useState('');
  const [collectionId, setCollectionId] = useState('unsorted');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionMessage, setCollectionMessage] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [type, setType] = useState<BookmarkType>('link');
  const [isScraping, setIsScraping] = useState(false);
  const [readerContent, setReaderContent] = useState<any>(undefined);

  useEffect(() => {
    setTagInput('');
    setShowNewCollection(false);
    setNewCollectionName('');
    setCollectionMessage('');
    if (bookmarkToEdit) {
      setUrl(bookmarkToEdit.url);
      setTitle(bookmarkToEdit.title);
      setDescription(bookmarkToEdit.description || '');
      setNote(bookmarkToEdit.note || '');
      setCover(bookmarkToEdit.cover || '');
      setFavicon(bookmarkToEdit.favicon || '');
      setCollectionId(bookmarkToEdit.collectionId || 'unsorted');
      setTags(bookmarkToEdit.tags || []);
      setIsFavorite(bookmarkToEdit.isFavorite || false);
      setIsDone(bookmarkToEdit.isDone || false);
      setType(bookmarkToEdit.type || 'link');
      setReaderContent(bookmarkToEdit.readerContent);
    } else {
      setUrl('');
      setTitle('');
      setDescription('');
      setNote('');
      setCover('');
      setFavicon('');
      setCollectionId(defaultCollectionId && defaultCollectionId !== 'all' && defaultCollectionId !== 'favorites' && defaultCollectionId !== 'trash' ? defaultCollectionId : 'unsorted');
      setTags([]);
      setIsFavorite(false);
      setIsDone(false);
      setType('link');
      setReaderContent(undefined);
    }
  }, [bookmarkToEdit, defaultCollectionId, isOpen]);

  const scrapeAbortControllerRef = useRef<AbortController | null>(null);

  const fetchMetadata = async (rawUrl: string, refresh = false, replaceCover = false) => {
    const clean = rawUrl.trim();
    if (!clean || !/^https?:\/\//i.test(clean) || (bookmarkToEdit?.id && !refresh)) return;

    const domain = extractDomain(clean);
    if (!favicon) {
      setFavicon(getFaviconUrl(domain));
    }

    const ytThumb = getYouTubeThumbnail(clean);
    if (ytThumb && !cover) {
      setCover(ytThumb);
      setType('video');
    }

    if (scrapeAbortControllerRef.current) {
      scrapeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    scrapeAbortControllerRef.current = controller;

    try {
      setIsScraping(true);
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(clean)}`, {
        signal: controller.signal
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title && (!title || isSparseTitle(title, domain, clean))) {
          setTitle(data.title);
        }
        if (data.description && !description) {
          setDescription(data.description);
        }
        if (data.cover && (!cover || replaceCover)) {
          setCover(data.cover);
        }
        if (data.favicon) {
          setFavicon(data.favicon);
        }
        if (data.type && type === 'link') {
          setType(data.type);
        }
        if (data.readerContent && !readerContent) {
          setReaderContent(data.readerContent);
        }
      } else {
        if (!title) setTitle(domain);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        if (!title) setTitle(domain);
      }
    } finally {
      setIsScraping(false);
    }
  };

  // Debounced auto-fetch when URL is typed or pasted
  useEffect(() => {
    if (!isOpen || bookmarkToEdit?.id || !url.trim() || !/^https?:\/\//i.test(url.trim())) return;
    if (title && cover) return;
    const timer = setTimeout(() => {
      fetchMetadata(url.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [url, bookmarkToEdit, isOpen]);

  const handleAddTag = (newTag: string) => {
    const clean = newTag.trim().toLowerCase().replace(/^#/, '');
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const createCollection = () => {
    const name = newCollectionName.trim();
    if (!name) { setCollectionMessage('Enter a collection name.'); return; }
    const existing = collections.find((col) => col.title.trim().toLowerCase() === name.toLowerCase());
    const collection = existing || onCreateCollection(name);
    setCollectionId(collection.id);
    setShowNewCollection(false);
    setNewCollectionName('');
    setCollectionMessage(existing ? 'Existing collection selected.' : 'Collection created and selected.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const cleanUrl = normalizeUrl(url.trim());
    try {
      const parsed = new URL(cleanUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
    } catch { return; }
    if (existingBookmarks.some((item) => !item.isTrash && item.id !== bookmarkToEdit?.id && normalizeUrl(item.url) === cleanUrl)) return;
    const domain = extractDomain(cleanUrl);

    onSave({
      url: cleanUrl,
      title: title.trim() || domain,
      description: description.trim(),
      note: note.trim(),
      cover: cover.trim() || undefined,
      favicon: favicon.trim() || getFaviconUrl(domain),
      collectionId,
      tags: tagInput.trim() ? Array.from(new Set([...tags, tagInput.trim().toLowerCase().replace(/^#/, '')].filter(Boolean))) : tags,
      isFavorite,
      isDone,
      type,
      isTrash: false,
      readerContent
    });
    onClose();
  };

  if (!isOpen) return null;

  const duplicate = url.trim() ? existingBookmarks.find((item) => !item.isTrash && item.id !== bookmarkToEdit?.id && normalizeUrl(item.url) === normalizeUrl(url)) : undefined;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={bookmarkToEdit?.id ? 'Edit bookmark' : 'Add bookmark'} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-[#151518] rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="font-bold text-base text-neutral-900 dark:text-white flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-sky-500" />
            {bookmarkToEdit?.id ? 'Edit Bookmark' : 'Add New Bookmark'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* URL Input */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              URL *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted && /^https?:\/\//i.test(pasted.trim())) {
                    fetchMetadata(pasted.trim());
                  }
                }}
                onBlur={() => {
                  if (url.trim() && !bookmarkToEdit?.id) {
                    fetchMetadata(url.trim());
                  }
                }}
                placeholder="https://example.com/article"
                className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
                autoFocus={!bookmarkToEdit?.id}
              />
              {isScraping && (
                <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-xs text-sky-500 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Fetching details & cover...</span>
                </div>
              )}
            </div>
            {duplicate && <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-400">Already saved as “{duplicate.title}”. <button type="button" className="underline font-semibold" onClick={() => onEditExisting(duplicate)}>Edit existing bookmark</button></p>}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bookmark Title"
              className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Description / Snippet
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description or excerpt"
              className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl focus:border-sky-500 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Collection & Type Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Collection
              </label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
              >
                <option value="unsorted">📥 Unsorted</option>
                {flattenCollections(collections)
                  .map(({ collection: col, depth }) => (
                    <option key={col.id} value={col.id}>
                      {'— '.repeat(depth)}📁 {col.title}
                    </option>
                  ))}
              </select>
              <button type="button" onClick={() => { setShowNewCollection((open) => !open); setCollectionMessage(''); }} aria-expanded={showNewCollection} className="mt-1 text-xs text-sky-600 hover:underline">{showNewCollection ? 'Cancel' : '+ New collection'}</button>
              {showNewCollection && <div className="flex gap-1 mt-2">
                <input aria-label="New collection name" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); createCollection(); } }} maxLength={120} autoFocus className="min-w-0 w-full px-2 py-1 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg" placeholder="Collection name" />
                <button type="button" onClick={createCollection} className="px-2 py-1 rounded-lg bg-sky-500 text-white text-xs">Create</button>
              </div>}
              {collectionMessage && <p role="status" className="mt-1 text-xs text-neutral-500">{collectionMessage}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as BookmarkType)}
                className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl focus:border-sky-500 focus:outline-none transition-colors capitalize"
              >
                <option value="link">Link</option>
                <option value="article">Article</option>
                <option value="video">Video</option>
                <option value="image">Image</option>
                <option value="document">Document</option>
                <option value="audio">Audio</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl min-h-[42px] items-center">
              {tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-md text-xs bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-rose-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  }
                }}
                placeholder={tags.length === 0 ? 'Type tag and press Enter...' : ''}
                className="bg-transparent text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none flex-1 min-w-[80px]"
              />
            </div>

            {/* Suggested Tags */}
            {availableTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-[10px] text-neutral-400 mr-1 self-center">Suggestions:</span>
                {availableTags.filter((t) => !tags.includes(t.name) && t.name.toLowerCase().includes(tagInput.trim().toLowerCase().replace(/^#/, ''))).slice(0, 5).map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => handleAddTag(t.name)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-sky-500"
                  >
                    +{t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Personal Note */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              Personal Note (Markdown)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add your thoughts, quotes, or highlights..."
              className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl focus:border-sky-500 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Cover & Favorite Options */}
          <div>
            <label htmlFor="bookmark-cover" className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">Cover image URL</label>
            <input id="bookmark-cover" type="url" value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://example.com/image.jpg" className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-[#1c1c20] border border-neutral-200 dark:border-neutral-800 rounded-xl" />
            <button type="button" disabled={isScraping || !url.trim()} onClick={() => fetchMetadata(url, true)} className="mt-2 text-xs text-sky-600 disabled:opacity-50">{isScraping ? 'Fetching details…' : 'Fetch missing details'}</button>
            {cover && <button type="button" disabled={isScraping || !url.trim()} onClick={() => fetchMetadata(url, true, true)} className="mt-2 ml-3 text-xs text-sky-600 disabled:opacity-50">Refresh cover</button>}
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDone(!isDone)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  isDone
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${isDone ? 'text-emerald-500' : ''}`} />
                <span>{isDone ? 'Done' : 'Mark as Done'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFavorite(!isFavorite)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  isFavorite
                    ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 dark:text-yellow-400'
                    : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-yellow-400' : ''}`} />
                <span>{isFavorite ? 'Starred' : 'Favorite'}</span>
              </button>
            </div>

            {cover && (
              <div className="flex items-center gap-2">
                <img
                  src={cover}
                  alt="Cover Preview"
                  className="w-7 h-7 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700 shadow-sm"
                  onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                />
                <span className="text-[11px] text-emerald-500 flex items-center gap-1 font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  Cover attached
                </span>
              </div>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(duplicate)}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 active:scale-95 transition-all"
            >
              {bookmarkToEdit?.id ? 'Save Changes' : 'Add Bookmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
