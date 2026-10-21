import React from 'react';
import { Bookmark } from '@keepsake/shared';
import { Star, ExternalLink, BookOpen, Edit2, Trash2, CheckSquare, Square } from 'lucide-react';

interface CardsViewProps {
  bookmarks: Bookmark[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onOpenReader: (bm: Bookmark) => void;
}

export const CardsView: React.FC<CardsViewProps> = ({
  bookmarks,
  selectedIds,
  onToggleSelect,
  onToggleFavorite,
  onEdit,
  onDelete,
  onOpenReader
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {bookmarks.map((bm) => {
        const isSelected = selectedIds.has(bm.id);

        return (
          <div
            key={bm.id}
            className={`group relative bg-white dark:bg-slate-900 rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col ${
              isSelected
                ? 'border-sky-500 ring-2 ring-sky-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {/* Cover Image Thumbnail */}
            {bm.cover ? (
              <div className="relative h-44 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <img
                  src={bm.cover}
                  alt={bm.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    // Hide cover on broken image
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            ) : (
              <div className="h-20 w-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
                <img
                  src={bm.favicon}
                  alt={bm.domain}
                  className="w-8 h-8 opacity-40 rounded"
                  onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                />
              </div>
            )}

            {/* Selection Checkbox */}
            <button
              onClick={() => onToggleSelect(bm.id)}
              className={`absolute top-2.5 left-2.5 p-1 rounded-md bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow transition-all ${
                isSelected ? 'opacity-100 text-sky-500' : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700'
              }`}
            >
              {isSelected ? <CheckSquare className="w-4 h-4 fill-sky-500 text-white" /> : <Square className="w-4 h-4" />}
            </button>

            {/* Favorite Star */}
            <button
              onClick={() => onToggleFavorite(bm.id)}
              className={`absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow transition-all ${
                bm.isFavorite ? 'opacity-100 text-yellow-400' : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-yellow-400'
              }`}
            >
              <Star className={`w-4 h-4 ${bm.isFavorite ? 'fill-yellow-400' : ''}`} />
            </button>

            {/* Card Body */}
            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                {/* Domain & Favicon */}
                <div className="flex items-center gap-2 mb-1.5">
                  <img
                    src={bm.favicon}
                    alt=""
                    className="w-3.5 h-3.5 rounded shrink-0"
                    onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                  />
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                    {bm.domain}
                  </span>
                </div>

                {/* Title */}
                <a
                  href={bm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 line-clamp-2 leading-snug mb-2"
                >
                  {bm.title || bm.url}
                </a>

                {/* Excerpt / Description */}
                {bm.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                    {bm.description}
                  </p>
                )}

                {/* Personal Note */}
                {bm.note && (
                  <div className="p-2 mb-3 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-[11px] text-amber-900 dark:text-amber-200 line-clamp-2">
                    <span className="font-semibold">Note:</span> {bm.note}
                  </div>
                )}
              </div>

              <div>
                {/* Tags */}
                {bm.tags && bm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {bm.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Card Footer Actions */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>{new Date(bm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {bm.readerContent && (
                      <button
                        onClick={() => onOpenReader(bm)}
                        title="Reader Mode"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-sky-500"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onEdit(bm)}
                      title="Edit"
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={bm.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open Original"
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => onDelete(bm.id)}
                      title="Delete"
                      className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
