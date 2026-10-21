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
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 bg-white dark:bg-[#151518] border-y sm:border sm:rounded-xl border-neutral-200 dark:border-neutral-800 mx-0 sm:mx-4 my-2 overflow-hidden shadow-sm">
      {bookmarks.map((bm) => {
        const isSelected = selectedIds.has(bm.id);

        return (
          <div
            key={bm.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', bm.id);
              e.dataTransfer.setData('keepsake/bookmark-id', bm.id);
              e.dataTransfer.effectAllowed = 'copyMove';
            }}
            className={`group flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-grab active:cursor-grabbing ${
              isSelected ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''
            }`}
          >
            {/* Left: Checkbox + Favicon + Content */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={() => onToggleSelect(bm.id)}
                className="text-neutral-400 hover:text-sky-500 shrink-0"
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 fill-sky-500 text-white" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={() => onToggleFavorite(bm.id)}
                className="shrink-0 text-neutral-300 hover:text-yellow-400 dark:text-neutral-600 transition-colors"
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
                    className="text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:text-sky-600 dark:hover:text-sky-400 truncate"
                  >
                    {bm.title || bm.url}
                  </a>

                  {bm.readerContent && (
                    <button
                      onClick={() => onOpenReader(bm)}
                      title="Reader Mode Available"
                      className="shrink-0 p-0.5 rounded text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  <span className="truncate">{bm.domain}</span>
                  {bm.description && (
                    <span className="hidden md:inline text-neutral-400 truncate max-w-sm">
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
                      className="px-2 py-0.5 rounded text-[10px] bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300"
                    >
                      #{t}
                    </span>
                  ))}
                  {bm.tags.length > 3 && (
                    <span className="text-[10px] text-neutral-400">+{bm.tags.length - 3}</span>
                  )}
                </div>
              )}

              <span className="text-xs text-neutral-400 w-16 text-right">
                {new Date(bm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(bm)}
                  title="Edit"
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <a
                  href={bm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open Original"
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => onDelete(bm.id)}
                  title="Delete"
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-neutral-500 hover:text-rose-500"
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
