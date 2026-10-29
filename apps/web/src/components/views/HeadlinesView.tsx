import React from 'react';
import { Bookmark } from '@keepsake/shared';
import { Star, ExternalLink, BookOpen, Trash2, Edit2, CheckCircle2, Check } from 'lucide-react';

interface HeadlinesViewProps {
  bookmarks: Bookmark[];
  onToggleFavorite: (id: string) => void;
  onToggleDone: (id: string) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onOpenReader: (bm: Bookmark) => void;
}

export const HeadlinesView: React.FC<HeadlinesViewProps> = ({
  bookmarks,
  onToggleFavorite,
  onToggleDone,
  onEdit,
  onDelete,
  onOpenReader
}) => {
  return (
    <div className="bg-white dark:bg-[#151518] border-y sm:border sm:rounded-xl border-neutral-200 dark:border-neutral-800 mx-0 sm:mx-4 my-2 divide-y divide-neutral-100 dark:divide-neutral-800/80 shadow-sm">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', bm.id);
            e.dataTransfer.setData('keepsake/bookmark-id', bm.id);
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          className="group flex items-center justify-between gap-4 px-4 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-sm cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => onToggleFavorite(bm.id)}
              title={bm.isFavorite ? 'Starred' : 'Favorite'}
              className="shrink-0 text-neutral-300 hover:text-yellow-400 dark:text-neutral-600 transition-colors"
            >
              <Star className={`w-3.5 h-3.5 ${bm.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            </button>

            <button
              onClick={() => onToggleDone(bm.id)}
              title={bm.isDone ? 'Done (click to mark as pending)' : 'Mark as Done'}
              className={`shrink-0 transition-colors ${
                bm.isDone
                  ? 'text-emerald-500 hover:text-emerald-600'
                  : 'text-neutral-300 hover:text-emerald-500 dark:text-neutral-600'
              }`}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${bm.isDone ? 'fill-emerald-500/20' : ''}`} />
            </button>

            <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono w-28 shrink-0 truncate">
              {bm.domain}
            </span>

            <a
              href={bm.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`font-medium truncate ${
                bm.isDone
                  ? 'text-neutral-500 dark:text-neutral-400 line-through'
                  : 'text-neutral-900 dark:text-neutral-100 hover:text-sky-600 dark:hover:text-sky-400'
              }`}
            >
              {bm.title || bm.url}
            </a>

            {bm.isDone && (
              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                Done
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-neutral-400">
              {new Date(bm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {bm.readerContent && (
                <button
                  onClick={() => onOpenReader(bm)}
                  title="Reader Mode"
                  className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-sky-500"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                </button>
              )}
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
                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500"
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
      ))}
    </div>
  );
};
