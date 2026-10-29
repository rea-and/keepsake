import React from 'react';
import { Bookmark } from '@keepsake/shared';
import { Star, ExternalLink, BookOpen, Edit2, Trash2, CheckCircle2, Check } from 'lucide-react';

interface MoodboardViewProps {
  bookmarks: Bookmark[];
  onToggleFavorite: (id: string) => void;
  onToggleDone: (id: string) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onOpenReader: (bm: Bookmark) => void;
}

export const MoodboardView: React.FC<MoodboardViewProps> = ({
  bookmarks,
  onToggleFavorite,
  onToggleDone,
  onEdit,
  onDelete,
  onOpenReader
}) => {
  return (
    <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 p-4 space-y-4">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', bm.id);
            e.dataTransfer.setData('keepsake/bookmark-id', bm.id);
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          className="break-inside-avoid group relative bg-white dark:bg-[#151518] rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800/80 shadow-sm hover:shadow-lg transition-all cursor-grab active:cursor-grabbing"
        >
          {/* Cover Image */}
          {bm.cover ? (
            <div className="relative overflow-hidden bg-neutral-100 dark:bg-neutral-900">
              <img
                src={bm.cover}
                alt={bm.title}
                className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ) : (
            <div className="h-32 bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-900 dark:to-[#1c1c20] flex items-center justify-center p-4">
              <span className="font-bold text-neutral-400 text-sm">{bm.domain}</span>
            </div>
          )}

          {/* Quick Actions (Done + Favorite) */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            <button
              onClick={() => onToggleDone(bm.id)}
              title={bm.isDone ? 'Done (click to mark as pending)' : 'Mark as Done'}
              className={`p-1.5 rounded-full backdrop-blur shadow transition-all ${
                bm.isDone
                  ? 'opacity-100 bg-emerald-500 text-white shadow-emerald-500/20'
                  : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:text-emerald-400'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.8]" />
            </button>

            <button
              onClick={() => onToggleFavorite(bm.id)}
              title={bm.isFavorite ? 'Starred' : 'Favorite'}
              className={`p-1.5 rounded-full bg-black/50 backdrop-blur shadow text-white transition-opacity ${
                bm.isFavorite ? 'opacity-100 text-yellow-400' : 'opacity-0 group-hover:opacity-100 hover:text-yellow-400'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${bm.isFavorite ? 'fill-yellow-400' : ''}`} />
            </button>
          </div>

          {/* Body */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-neutral-400">
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
              className="block text-xs font-semibold hover:text-sky-500 line-clamp-2 mb-2 leading-tight text-neutral-900 dark:text-neutral-100"
            >
              {bm.title || bm.url}
            </a>

            {/* Hover Action Bar */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <span>{new Date(bm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {bm.readerContent && (
                  <button
                    onClick={() => onOpenReader(bm)}
                    title="Reader View"
                    className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sky-500"
                  >
                    <BookOpen className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => onEdit(bm)}
                  title="Edit"
                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <a
                  href={bm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => onDelete(bm.id)}
                  title="Delete"
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500"
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
