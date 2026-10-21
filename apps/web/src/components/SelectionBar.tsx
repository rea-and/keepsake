import React, { useState } from 'react';
import { Collection } from '@keepsake/shared';
import { FolderInput, Tag, Star, Trash2, X, Check } from 'lucide-react';

interface SelectionBarProps {
  selectedCount: number;
  collections: Collection[];
  onDeselectAll: () => void;
  onBulkMove: (collectionId: string) => void;
  onBulkAddTag: (tag: string) => void;
  onBulkFavorite: (isFavorite: boolean) => void;
  onBulkDelete: () => void;
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
  selectedCount,
  collections,
  onDeselectAll,
  onBulkMove,
  onBulkAddTag,
  onBulkFavorite,
  onBulkDelete
}) => {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagText, setTagText] = useState('');

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 border-r border-slate-700 pr-3">
        <span className="text-xs font-semibold bg-sky-500 px-2 py-0.5 rounded-full">
          {selectedCount}
        </span>
        <span className="text-xs font-medium text-slate-300">Selected</span>
      </div>

      <div className="flex items-center gap-1.5 relative">
        {/* Move to Collection */}
        <div className="relative">
          <button
            onClick={() => setShowMoveMenu(!showMoveMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            <FolderInput className="w-3.5 h-3.5 text-sky-400" />
            <span>Move</span>
          </button>

          {showMoveMenu && (
            <div
              className="absolute bottom-10 left-0 w-48 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 text-xs max-h-60 overflow-y-auto"
              onMouseLeave={() => setShowMoveMenu(false)}
            >
              <div className="px-3 py-1 font-semibold text-slate-400 uppercase text-[10px]">
                Move to Collection
              </div>
              <button
                onClick={() => {
                  onBulkMove('unsorted');
                  setShowMoveMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                📥 Unsorted
              </button>
              {collections
                .filter((c) => !c.isSystem)
                .map((col) => (
                  <button
                    key={col.id}
                    onClick={() => {
                      onBulkMove(col.id);
                      setShowMoveMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 truncate"
                  >
                    📁 {col.title}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Add Tag */}
        <div className="relative">
          <button
            onClick={() => setShowTagInput(!showTagInput)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            <Tag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tag</span>
          </button>

          {showTagInput && (
            <div
              className="absolute bottom-10 left-0 w-48 p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 text-xs"
              onMouseLeave={() => setShowTagInput(false)}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tagText.trim()) {
                    onBulkAddTag(tagText.trim());
                    setTagText('');
                    setShowTagInput(false);
                  }
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="text"
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  placeholder="tag-name"
                  autoFocus
                  className="w-full px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs focus:outline-none"
                />
                <button
                  type="submit"
                  className="p-1 rounded bg-sky-500 text-white hover:bg-sky-600"
                >
                  <Check className="w-3 h-3" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Favorite */}
        <button
          onClick={() => onBulkFavorite(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium transition-colors"
        >
          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
          <span>Star</span>
        </button>

        {/* Delete */}
        <button
          onClick={onBulkDelete}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-rose-950/60 text-xs font-medium text-rose-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
      </div>

      <button
        onClick={onDeselectAll}
        className="p-1 rounded-md text-slate-400 hover:text-white border-l border-slate-700 pl-2 ml-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
