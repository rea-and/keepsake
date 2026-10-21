import React from 'react';
import { Bookmark } from '@keepsake/shared';
import { Star, ExternalLink, BookOpen, Trash2, Edit2 } from 'lucide-react';

interface HeadlinesViewProps {
  bookmarks: Bookmark[];
  onToggleFavorite: (id: string) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onOpenReader: (bm: Bookmark) => void;
}

export const HeadlinesView: React.FC<HeadlinesViewProps> = ({
  bookmarks,
  onToggleFavorite,
  onEdit,
  onDelete,
  onOpenReader
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 border-y sm:border sm:rounded-xl border-slate-200 dark:border-slate-800 mx-0 sm:mx-4 my-2 divide-y divide-slate-100 dark:divide-slate-800/80 shadow-sm">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          className="group flex items-center justify-between gap-4 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-sm"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => onToggleFavorite(bm.id)}
              className="shrink-0 text-slate-300 hover:text-yellow-400 dark:text-slate-600 transition-colors"
            >
              <Star className={`w-3.5 h-3.5 ${bm.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            </button>

            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono w-28 shrink-0 truncate">
              {bm.domain}
            </span>

            <a
              href={bm.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 font-medium truncate"
            >
              {bm.title || bm.url}
            </a>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400">
              {new Date(bm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {bm.readerContent && (
                <button
                  onClick={() => onOpenReader(bm)}
                  title="Reader Mode"
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-sky-500"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                </button>
              )}
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
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
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
      ))}
    </div>
  );
};
