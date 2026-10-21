import React, { useState } from 'react';
import {
  Bookmark as BookmarkIcon,
  Inbox,
  Star,
  Trash2,
  Folder,
  FolderPlus,
  Tag,
  Settings,
  Cloud,
  CloudOff,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  MoreVertical,
  Edit2,
  Check,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Code,
  Sparkles,
  Music,
  Video,
  FileText,
  LogOut
} from 'lucide-react';
import { Collection, AuthSession, SyncStatus } from '@keepsake/shared';

const ICON_MAP: Record<string, React.ReactNode> = {
  Folder: <Folder className="w-4 h-4" />,
  BookOpen: <BookOpen className="w-4 h-4" />,
  Code: <Code className="w-4 h-4" />,
  Sparkles: <Sparkles className="w-4 h-4" />,
  Music: <Music className="w-4 h-4" />,
  Video: <Video className="w-4 h-4" />,
  FileText: <FileText className="w-4 h-4" />
};

interface SidebarProps {
  collections: Collection[];
  activeCollectionId: string;
  onSelectCollection: (id: string) => void;
  counts: { allCount: number; unsortedCount: number; favoritesCount: number; trashCount: number };
  allTags: Array<{ name: string; count: number }>;
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  authSession: AuthSession | null;
  syncStatus: SyncStatus;
  onSync: () => void;
  isDriveSyncEnabled?: boolean;
  themeMode: 'system' | 'light' | 'dark';
  effectiveTheme: 'light' | 'dark';
  onCycleTheme: () => void;
  onOpenSettings: () => void;
  onOpenAddBookmark: () => void;
  onOpenAddCollection: () => void;
  onEditCollection: (col: Collection) => void;
  onDeleteCollection: (id: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onLogout?: () => void;
  onDropOnCollection?: (bookmarkId: string, collectionId: string) => void;
  onDropOnTag?: (bookmarkId: string, tag: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collections,
  activeCollectionId,
  onSelectCollection,
  counts,
  allTags,
  activeTag,
  onSelectTag,
  authSession,
  syncStatus,
  onSync,
  isDriveSyncEnabled = false,
  themeMode,
  effectiveTheme,
  onCycleTheme,
  onOpenSettings,
  onOpenAddBookmark,
  onOpenAddCollection,
  onEditCollection,
  onDeleteCollection,
  isOpenMobile,
  onCloseMobile,
  onLogout,
  onDropOnCollection,
  onDropOnTag
}) => {
  const [collectionMenuId, setCollectionMenuId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 flex flex-col bg-white dark:bg-[#121214] border-r border-neutral-200 dark:border-neutral-800/80 transition-transform duration-300 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 font-bold">
              <BookmarkIcon className="w-4 h-4 fill-current" />
            </div>
            <span className="font-bold text-base tracking-tight text-neutral-900 dark:text-white">
              Keepsake
            </span>
          </div>

          <button
            onClick={onOpenAddBookmark}
            title="Add Bookmark"
            className="w-8 h-8 rounded-lg bg-sky-500 hover:bg-sky-600 active:scale-95 text-white flex items-center justify-center transition-all shadow-sm"
          >
            <span className="text-xl font-light leading-none">+</span>
          </button>
        </div>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* System Nav */}
          <div className="space-y-0.5">
            <button
              onClick={() => {
                onSelectCollection('all');
                onSelectTag(null);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeCollectionId === 'all' && !activeTag
                  ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookmarkIcon className="w-4 h-4 text-sky-500" />
                <span>All Bookmarks</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                {counts.allCount}
              </span>
            </button>

            <button
              onClick={() => {
                onSelectCollection('unsorted');
                onSelectTag(null);
                onCloseMobile();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverTarget !== 'col:unsorted') setDragOverTarget('col:unsorted');
              }}
              onDragLeave={() => {
                if (dragOverTarget === 'col:unsorted') setDragOverTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTarget(null);
                const id = e.dataTransfer.getData('keepsake/bookmark-id') || e.dataTransfer.getData('text/plain');
                if (id && onDropOnCollection) {
                  onDropOnCollection(id, 'unsorted');
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                dragOverTarget === 'col:unsorted'
                  ? 'bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-500 text-amber-700 dark:text-amber-300 scale-[1.02] shadow-sm font-semibold'
                  : activeCollectionId === 'unsorted' && !activeTag
                  ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Inbox className="w-4 h-4 text-amber-500" />
                <span>Unsorted</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                {counts.unsortedCount}
              </span>
            </button>

            <button
              onClick={() => {
                onSelectCollection('favorites');
                onSelectTag(null);
                onCloseMobile();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverTarget !== 'col:favorites') setDragOverTarget('col:favorites');
              }}
              onDragLeave={() => {
                if (dragOverTarget === 'col:favorites') setDragOverTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTarget(null);
                const id = e.dataTransfer.getData('keepsake/bookmark-id') || e.dataTransfer.getData('text/plain');
                if (id && onDropOnCollection) {
                  onDropOnCollection(id, 'favorites');
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                dragOverTarget === 'col:favorites'
                  ? 'bg-yellow-100 dark:bg-yellow-950/60 ring-2 ring-yellow-400 text-yellow-700 dark:text-yellow-300 scale-[1.02] shadow-sm font-semibold'
                  : activeCollectionId === 'favorites' && !activeTag
                  ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span>Favorites</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                {counts.favoritesCount}
              </span>
            </button>

            <button
              onClick={() => {
                onSelectCollection('trash');
                onSelectTag(null);
                onCloseMobile();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverTarget !== 'col:trash') setDragOverTarget('col:trash');
              }}
              onDragLeave={() => {
                if (dragOverTarget === 'col:trash') setDragOverTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTarget(null);
                const id = e.dataTransfer.getData('keepsake/bookmark-id') || e.dataTransfer.getData('text/plain');
                if (id && onDropOnCollection) {
                  onDropOnCollection(id, 'trash');
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                dragOverTarget === 'col:trash'
                  ? 'bg-rose-100 dark:bg-rose-950/60 ring-2 ring-rose-500 text-rose-700 dark:text-rose-300 scale-[1.02] shadow-sm font-semibold'
                  : activeCollectionId === 'trash' && !activeTag
                  ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-semibold'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                <span>Trash</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                {counts.trashCount}
              </span>
            </button>
          </div>

          {/* Collections List */}
          <div>
            <div className="flex items-center justify-between px-3 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Collections
              </span>
              <button
                onClick={onOpenAddCollection}
                title="Create Collection"
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-0.5">
              {collections
                .filter((col) => !col.isSystem)
                .map((col) => {
                  const isActive = activeCollectionId === col.id && !activeTag;
                  return (
                    <div key={col.id} className="relative group">
                      <button
                        onClick={() => {
                          onSelectCollection(col.id);
                          onSelectTag(null);
                          onCloseMobile();
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverTarget !== `col:${col.id}`) setDragOverTarget(`col:${col.id}`);
                        }}
                        onDragLeave={() => {
                          if (dragOverTarget === `col:${col.id}`) setDragOverTarget(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverTarget(null);
                          const id = e.dataTransfer.getData('keepsake/bookmark-id') || e.dataTransfer.getData('text/plain');
                          if (id && onDropOnCollection) {
                            onDropOnCollection(id, col.id);
                          }
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all text-left ${
                          dragOverTarget === `col:${col.id}`
                            ? 'bg-sky-100 dark:bg-sky-950/70 ring-2 ring-sky-500 text-sky-700 dark:text-sky-300 scale-[1.02] shadow-sm font-semibold'
                            : isActive
                            ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: col.color || '#38bdf8' }}
                          />
                          <span className="truncate">{col.title}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCollectionMenuId(collectionMenuId === col.id ? null : col.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-all"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </button>

                      {/* Dropdown Options */}
                      {collectionMenuId === col.id && (
                        <div
                          className="absolute right-2 top-8 z-20 w-36 py-1 bg-white dark:bg-[#1c1c20] rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 text-xs"
                          onMouseLeave={() => setCollectionMenuId(null)}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCollectionMenuId(null);
                              onEditCollection(col);
                            }}
                            className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit Collection
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCollectionMenuId(null);
                              if (confirm(`Delete collection "${col.title}"? Bookmarks will move to Unsorted.`)) {
                                onDeleteCollection(col.id);
                              }
                            }}
                            className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Tags List */}
          {allTags.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Tags
                </span>
                {activeTag && (
                  <button
                    onClick={() => onSelectTag(null)}
                    className="text-[11px] text-sky-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 px-2">
                {allTags.map((tag) => {
                  const isTagActive = activeTag === tag.name;
                  return (
                    <button
                      key={tag.name}
                      onClick={() => {
                        onSelectTag(isTagActive ? null : tag.name);
                        onCloseMobile();
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        if (dragOverTarget !== `tag:${tag.name}`) setDragOverTarget(`tag:${tag.name}`);
                      }}
                      onDragLeave={() => {
                        if (dragOverTarget === `tag:${tag.name}`) setDragOverTarget(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverTarget(null);
                        const id = e.dataTransfer.getData('keepsake/bookmark-id') || e.dataTransfer.getData('text/plain');
                        if (id && onDropOnTag) {
                          onDropOnTag(id, tag.name);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 transition-all ${
                        dragOverTarget === `tag:${tag.name}`
                          ? 'bg-sky-500 text-white font-bold ring-2 ring-sky-400 scale-105 shadow-md'
                          : isTagActive
                          ? 'bg-sky-500 text-white font-medium shadow-sm'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                    >
                      <span>#{tag.name}</span>
                      <span className="text-[10px] opacity-60">({tag.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User & Sync Status Footer */}
        <div className="p-3 border-t border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-[#0c0c0e]/60 space-y-2">
          {/* Sync status button */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center gap-2 truncate">
              {authSession?.user?.picture ? (
                <img
                  src={authSession.user.picture}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : isDriveSyncEnabled ? (
                <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <CloudOff className="w-4 h-4 text-neutral-400 shrink-0" />
              )}
              <div className="text-xs truncate">
                <span className="font-medium text-neutral-700 dark:text-neutral-200 block truncate">
                  {authSession?.user?.name || 'Keepsake User'}
                </span>
                <span className="text-[10px] text-neutral-400 block truncate">
                  {!isDriveSyncEnabled
                    ? 'Drive Sync: Off'
                    : syncStatus.isSyncing
                    ? 'Syncing to Drive...'
                    : syncStatus.lastSyncedAt
                    ? `Synced ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Drive Sync Active'}
                </span>
              </div>
            </div>

            {isDriveSyncEnabled ? (
              <button
                onClick={onSync}
                disabled={syncStatus.isSyncing}
                title="Sync now"
                className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin text-sky-500' : ''}`}
                />
              </button>
            ) : (
              <button
                onClick={onOpenSettings}
                title="Google Drive sync is optional (Click to configure)"
                className="px-1.5 py-0.5 rounded text-[10px] text-neutral-400 hover:text-sky-500 font-medium transition-colors"
              >
                Off
              </button>
            )}
          </div>

          {/* Settings & Theme */}
          <div className="flex items-center justify-between pt-1 px-1">
            <div className="flex items-center gap-3">
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 font-medium transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Sign out of Keepsake"
                  className="flex items-center gap-1 text-xs text-neutral-400 hover:text-rose-500 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Logout</span>
                </button>
              )}
            </div>

            <button
              onClick={onCycleTheme}
              title={`Theme: ${
                themeMode === 'system'
                  ? `System (${effectiveTheme})`
                  : themeMode === 'dark'
                  ? 'Dark'
                  : 'Light'
              } (Click to switch)`}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 text-xs transition-colors"
            >
              {themeMode === 'system' ? (
                <Monitor className="w-3.5 h-3.5" />
              ) : themeMode === 'dark' ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5" />
              )}
              <span className="capitalize text-[11px] font-medium">{themeMode}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
