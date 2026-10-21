import React from 'react';
import { Bookmark } from '@keepsake/shared';
import { Star, ExternalLink, BookOpen, Edit2, Trash2, CheckSquare, Square } from 'lucide-react';

interface ListViewProps {
  bookmarks: Bookmark[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onOpenReader: (bm: Bookmark) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  bookmarks,
  selectedIds,
  onToggleSelect,
  onToggleFavorite,
  onEdit,
  onDelete,
  onOpenReader
}) => {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900 border-y sm:border sm:rounded-xl border-slate-200 dark:border-slate-800 mx-0 sm:mx-4 my-2 overflow-hidden shadow-sm">
      {bookmarks.map((bm) => {
        const isSelected = selectedIds.has(bm.id);

        return (
          <div
            key={bm.id}
            className={`group flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
              isSelected ? 'bg-sky-50/60 dark:bg-sky-950/30' : ''
            }`}
          >
            {/* Left: Checkbox + Favicon + Content */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={() => onToggleSelect(bm.id)}
                className="text-slate-400 hover:text-sky-500 shrink-0"
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 fill-sky-500 text-white" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={() => onToggleFavorite(bm.id)}
                className="shrink-0 text-slate-300 hover:text-yellow-400 dark:text-slate-600 transition-colors"
              >
                <Star className={`w-4 h-4 ${bm.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>

              <img
                src={bm.favicon}
                alt=""
                className="w-4 h-4 rounded shrink-0"
                onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <a
                    href={bm.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 truncate"
                  >
                    {bm.title || bm.url}
                  </a>

                  {bm.readerContent && (
                    <button
                      onClick={() => onOpenReader(bm)}
                      title="Reader Mode Available"
                      className="shrink-0 p-0.5 rounded text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="truncate">{bm.domain}</span>
                  {bm.description && (
                    <span className="hidden md:inline text-slate-400 truncate max-w-sm">
                      — {bm.description}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Tags + Date + Action Buttons */}
            <div className="flex items-center gap-3 shrink-0">
              {bm.tags && bm.tags.length > 0 && (
                <div className="hidden lg:flex items-center gap-1">
                  {bm.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      #{t}
                    </span>
                  ))}
                  {bm.tags.length > 3 && (
                    <span className="text-[10px] text-slate-400">+{bm.tags.length - 3}</span>
                  )}
                </div>
              )}

              <span className="text-xs text-slate-400 w-16 text-right">
                {new Date(bm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(bm)}
                  title="Edit"
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <a
                  href={bm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open Original"
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => onDelete(bm.id)}
                  title="Delete"
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-500 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
