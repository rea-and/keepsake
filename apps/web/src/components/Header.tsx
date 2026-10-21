import React, { useState } from 'react';
import {
  Menu,
  Search,
  X,
  LayoutGrid,
  List,
  AlignLeft,
  Image as ImageIcon,
  ArrowUpDown,
  Plus,
  HelpCircle
} from 'lucide-react';
import { ViewMode, SortField, SortOrder, BookmarkType } from '@keepsake/shared';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  title: string;
  itemCount: number;
  collectionColor?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeTag: string | null;
  onClearTag: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedType: BookmarkType | 'all';
  onSelectType: (type: BookmarkType | 'all') => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  onOpenAddBookmark: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileMenu,
  title,
  itemCount,
  collectionColor,
  searchQuery,
  onSearchChange,
  activeTag,
  onClearTag,
  viewMode,
  onViewModeChange,
  selectedType,
  onSelectType,
  sortField,
  sortOrder,
  onSortChange,
  onOpenAddBookmark
}) => {
  const [showSearchHelp, setShowSearchHelp] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#121214]/85 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800/80 px-4 py-3 space-y-3">
      {/* Top Row: Title, Search, Actions */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: Mobile Menu + Title */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            {collectionColor && (
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: collectionColor }}
              />
            )}
            <h1 className="text-lg font-bold text-neutral-900 dark:text-white truncate">
              {title}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
              {itemCount}
            </span>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="relative flex-1 max-w-xl mx-2">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search bookmarks, #tags, site:domain..."
              className="w-full pl-9 pr-14 py-1.5 text-sm bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/80 border border-transparent focus:border-sky-500 dark:focus:border-sky-500 rounded-lg text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none transition-all"
            />

            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowSearchHelp(!showSearchHelp)}
                title="Search syntax help"
                className="p-1 text-neutral-400 hover:text-sky-500 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search Help Dropdown */}
          {showSearchHelp && (
            <div
              className="absolute left-0 right-0 top-10 z-40 p-3 bg-white dark:bg-[#18181b] rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-2"
              onMouseLeave={() => setShowSearchHelp(false)}
            >
              <div className="font-semibold text-neutral-700 dark:text-neutral-200">
                Advanced Search Operators
              </div>
              <div className="grid grid-cols-2 gap-2 text-neutral-600 dark:text-neutral-300">
                <button
                  onClick={() => {
                    onSearchChange(searchQuery + ' #tag ');
                    setShowSearchHelp(false);
                  }}
                  className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-mono"
                >
                  #tag <span className="text-neutral-400 font-sans">Filter by tag</span>
                </button>
                <button
                  onClick={() => {
                    onSearchChange(searchQuery + ' site:github.com ');
                    setShowSearchHelp(false);
                  }}
                  className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-mono"
                >
                  site:domain <span className="text-neutral-400 font-sans">Filter website</span>
                </button>
                <button
                  onClick={() => {
                    onSearchChange(searchQuery + ' is:favorite ');
                    setShowSearchHelp(false);
                  }}
                  className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-mono"
                >
                  is:favorite <span className="text-neutral-400 font-sans">Only starred</span>
                </button>
                <button
                  onClick={() => {
                    onSearchChange(searchQuery + ' type:article ');
                    setShowSearchHelp(false);
                  }}
                  className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-mono"
                >
                  type:article <span className="text-neutral-400 font-sans">Articles</span>
                </button>
                <button
                  onClick={() => {
                    onSearchChange(searchQuery + ' has:note ');
                    setShowSearchHelp(false);
                  }}
                  className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-mono"
                >
                  has:note <span className="text-neutral-400 font-sans">With personal notes</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: View Mode + Add Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View Mode Switcher */}
          <div className="hidden sm:flex items-center bg-neutral-100 dark:bg-neutral-900 p-0.5 rounded-lg border border-neutral-200/60 dark:border-neutral-800">
            <button
              onClick={() => onViewModeChange('cards')}
              title="Cards View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-neutral-800 text-sky-500 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              title="List View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-neutral-800 text-sky-500 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('headlines')}
              title="Headlines View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'headlines'
                  ? 'bg-white dark:bg-neutral-800 text-sky-500 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('moodboard')}
              title="Moodboard View"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'moodboard'
                  ? 'bg-white dark:bg-neutral-800 text-sky-500 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              title="Sort bookmarks"
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {showSortMenu && (
              <div
                className="absolute right-0 top-10 z-40 w-44 py-1 bg-white dark:bg-[#18181b] rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 text-xs"
                onMouseLeave={() => setShowSortMenu(false)}
              >
                <div className="px-3 py-1 font-semibold text-neutral-400 uppercase text-[10px]">
                  Sort By
                </div>
                <button
                  onClick={() => {
                    onSortChange('createdAt', 'desc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    sortField === 'createdAt' && sortOrder === 'desc'
                      ? 'text-sky-500 font-semibold'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  Date Added (Newest)
                </button>
                <button
                  onClick={() => {
                    onSortChange('createdAt', 'asc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    sortField === 'createdAt' && sortOrder === 'asc'
                      ? 'text-sky-500 font-semibold'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  Date Added (Oldest)
                </button>
                <button
                  onClick={() => {
                    onSortChange('title', 'asc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    sortField === 'title' && sortOrder === 'asc'
                      ? 'text-sky-500 font-semibold'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  Title (A to Z)
                </button>
                <button
                  onClick={() => {
                    onSortChange('domain', 'asc');
                    setShowSortMenu(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    sortField === 'domain' && sortOrder === 'asc'
                      ? 'text-sky-500 font-semibold'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  Domain
                </button>
              </div>
            )}
          </div>

          {/* Quick Add Button */}
          <button
            onClick={onOpenAddBookmark}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 active:scale-95 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>

      {/* Bottom Sub-row: Content Type Filters & Active Tag Pill */}
      <div className="flex items-center justify-between text-xs overflow-x-auto pb-0.5 scrollbar-none">
        <div className="flex items-center gap-1.5">
          {(['all', 'article', 'video', 'image', 'link'] as const).map((type) => (
            <button
              key={type}
              onClick={() => onSelectType(type)}
              className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                selectedType === type
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {type === 'all' ? 'All Types' : `${type}s`}
            </button>
          ))}
        </div>

        {activeTag && (
          <div className="flex items-center gap-1.5 bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full text-xs font-medium">
            <span>#{activeTag}</span>
            <button onClick={onClearTag} className="hover:text-sky-900 dark:hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
