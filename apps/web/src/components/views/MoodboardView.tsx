import React from 'react';
import { Bookmark } from '@keepsake/shared';
import { Star, ExternalLink, BookOpen, Edit2, Trash2 } from 'lucide-react';

interface MoodboardViewProps {
  bookmarks: Bookmark[];
  onToggleFavorite: (id: string) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onOpenReader: (bm: Bookmark) => void;
}

export const MoodboardView: React.FC<MoodboardViewProps> = ({
  bookmarks,
  onToggleFavorite,
  onEdit,
  onDelete,
  onOpenReader
}) => {
  return (
    <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 p-4 space-y-4">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          className="break-inside-avoid group relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all"
        >
          {/* Cover Image */}
          {bm.cover ? (
            <div className="relative overflow-hidden bg-slate-100 dark:bg-slate-800">
              <img
                src={bm.cover}
                alt={bm.title}
                className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ) : (
            <div className="h-32 bg-gradient-to-br from-sky-400/20 to-indigo-500/20 flex items-center justify-center p-4">
              <span className="font-bold text-slate-400 text-sm">{bm.domain}</span>
            </div>
          )}

          {/* Quick Favorite Star */}
          <button
            onClick={() => onToggleFavorite(bm.id)}
            className={`absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/40 backdrop-blur shadow text-white transition-opacity ${
              bm.isFavorite ? 'opacity-100 text-yellow-400' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${bm.isFavorite ? 'fill-yellow-400' : ''}`} />
          </button>

          {/* Body */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
              <img
                src={bm.favicon}
                alt=""
                className="w-3 h-3 rounded"
                onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
              />
              <span className="truncate">{bm.domain}</span>
            </div>

            <a
              href={bm.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-sky-500 line-clamp-2 mb-2 leading-tight"
            >
              {bm.title || bm.url}
            </a>

            {/* Hover Action Bar */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>{new Date(bm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {bm.readerContent && (
                  <button
                    onClick={() => onOpenReader(bm)}
                    title="Reader View"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-sky-500"
                  >
                    <BookOpen className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => onEdit(bm)}
                  title="Edit"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <a
                  href={bm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => onDelete(bm.id)}
                  title="Delete"
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
