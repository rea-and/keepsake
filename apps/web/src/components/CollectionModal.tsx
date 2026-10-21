import React, { useState, useEffect } from 'react';
import { Collection, ViewMode } from '@keepsake/shared';
import { X, Folder, BookOpen, Code, Sparkles, Music, Video, FileText } from 'lucide-react';

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  collectionToEdit?: Collection | null;
}

const COLOR_PALETTE = [
  '#0284c7', // Sky
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#64748b'  // Slate
];

const AVAILABLE_ICONS = [
  { name: 'Folder', icon: <Folder className="w-4 h-4" /> },
  { name: 'BookOpen', icon: <BookOpen className="w-4 h-4" /> },
  { name: 'Code', icon: <Code className="w-4 h-4" /> },
  { name: 'Sparkles', icon: <Sparkles className="w-4 h-4" /> },
  { name: 'Music', icon: <Music className="w-4 h-4" /> },
  { name: 'Video', icon: <Video className="w-4 h-4" /> },
  { name: 'FileText', icon: <FileText className="w-4 h-4" /> }
];

export const CollectionModal: React.FC<CollectionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  collectionToEdit
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#0284c7');
  const [icon, setIcon] = useState('Folder');
  const [defaultViewMode, setDefaultViewMode] = useState<ViewMode>('cards');

  useEffect(() => {
    if (collectionToEdit) {
      setTitle(collectionToEdit.title);
      setDescription(collectionToEdit.description || '');
      setColor(collectionToEdit.color || '#0284c7');
      setIcon(collectionToEdit.icon || 'Folder');
      setDefaultViewMode(collectionToEdit.defaultViewMode || 'cards');
    } else {
      setTitle('');
      setDescription('');
      setColor('#0284c7');
      setIcon('Folder');
      setDefaultViewMode('cards');
    }
  }, [collectionToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      color,
      icon,
      defaultViewMode
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {collectionToEdit ? 'Edit Collection' : 'New Collection'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Collection Name *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Design Inspiration, Articles, Dev Tools"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note about this collection"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              Color Tag
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-slate-900' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Icon Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              Icon
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {AVAILABLE_ICONS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setIcon(item.name)}
                  className={`p-2 rounded-lg border transition-colors ${
                    icon === item.name
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-500'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Default View Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Default Layout
            </label>
            <select
              value={defaultViewMode}
              onChange={(e) => setDefaultViewMode(e.target.value as ViewMode)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-sky-500 focus:outline-none transition-colors capitalize"
            >
              <option value="cards">Cards (Visual Grid)</option>
              <option value="list">List (Dense Rows)</option>
              <option value="headlines">Headlines (Minimal)</option>
              <option value="moodboard">Moodboard (Masonry)</option>
            </select>
          </div>

          {/* Footer */}
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
              {collectionToEdit ? 'Save Changes' : 'Create Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
