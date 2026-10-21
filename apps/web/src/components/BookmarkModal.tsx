import React, { useState, useEffect } from 'react';
import { Bookmark, Collection, BookmarkType, extractDomain, getFaviconUrl } from '@keepsake/shared';
import { X, Loader2, Sparkles, Star, Tag as TagIcon, Folder, Link as LinkIcon } from 'lucide-react';

interface BookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  bookmarkToEdit?: Bookmark | null;
  collections: Collection[];
  availableTags: Array<{ name: string; count: number }>;
  defaultCollectionId?: string;
}

export const BookmarkModal: React.FC<BookmarkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  bookmarkToEdit,
  collections,
  availableTags,
  defaultCollectionId
}) => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [cover, setCover] = useState('');
  const [favicon, setFavicon] = useState('');
  const [collectionId, setCollectionId] = useState('unsorted');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [type, setType] = useState<BookmarkType>('link');
  const [isScraping, setIsScraping] = useState(false);
  const [readerContent, setReaderContent] = useState<any>(undefined);

  useEffect(() => {
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
      setType('link');
      setReaderContent(undefined);
    }
  }, [bookmarkToEdit, defaultCollectionId, isOpen]);

  if (!isOpen) return null;

  // Auto scrape metadata when URL changes and user moves focus or pastes
  const handleUrlBlur = async () => {
    if (!url || !url.trim() || bookmarkToEdit) return;

    try {
      setIsScraping(true);
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(url.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title && !title) setTitle(data.title);
        if (data.description && !description) setDescription(data.description);
        if (data.cover && !cover) setCover(data.cover);
        if (data.favicon && !favicon) setFavicon(data.favicon);
        if (data.type) setType(data.type);
        if (data.readerContent) setReaderContent(data.readerContent);
      } else {
        // Fallback
        const dom = extractDomain(url);
        if (!title) setTitle(dom);
        if (!favicon) setFavicon(getFaviconUrl(dom));
      }
    } catch {
      const dom = extractDomain(url);
      if (!title) setTitle(dom);
      if (!favicon) setFavicon(getFaviconUrl(dom));
    } finally {
      setIsScraping(false);
    }
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    onSave({
      url: url.trim(),
      title: title.trim() || extractDomain(url),
      description: description.trim(),
      note: note.trim(),
      cover: cover.trim() || undefined,
      favicon: favicon.trim() || getFaviconUrl(url),
      collectionId,
      tags,
      isFavorite,
      type,
      isTrash: false,
      readerContent
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-sky-500" />
            {bookmarkToEdit ? 'Edit Bookmark' : 'Add New Bookmark'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* URL Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              URL *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder="https://example.com/article"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
                autoFocus={!bookmarkToEdit}
              />
              {isScraping && (
                <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-xs text-sky-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Fetching...</span>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bookmark Title"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Description / Snippet
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description or excerpt"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Collection & Type Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Collection
              </label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
              >
                <option value="unsorted">📥 Unsorted</option>
                {collections
                  .filter((c) => !c.isSystem)
                  .map((col) => (
                    <option key={col.id} value={col.id}>
                      📁 {col.title}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as BookmarkType)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors capitalize"
              >
                <option value="link">Link</option>
                <option value="article">Article</option>
                <option value="video">Video</option>
                <option value="image">Image</option>
                <option value="document">Document</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl min-h-[42px] items-center">
              {tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-md text-xs bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1"
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
                className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none flex-1 min-w-[80px]"
              />
            </div>

            {/* Suggested Tags */}
            {availableTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-[10px] text-slate-400 mr-1 self-center">Suggestions:</span>
                {availableTags.slice(0, 5).map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => handleAddTag(t.name)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-sky-500"
                  >
                    +{t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Personal Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Personal Note (Markdown)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add your thoughts, quotes, or highlights..."
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Cover & Favorite Options */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                isFavorite
                  ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-yellow-400' : ''}`} />
              <span>{isFavorite ? 'Starred' : 'Favorite'}</span>
            </button>

            {cover && (
              <span className="text-[11px] text-emerald-500 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Cover image attached
              </span>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 active:scale-95 transition-all"
            >
              {bookmarkToEdit ? 'Save Changes' : 'Add Bookmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
