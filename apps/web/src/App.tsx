import React, { useState, useEffect, useRef } from 'react';
import { useKeepsakeStore } from './store/useStore';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { CardsView } from './components/views/CardsView';
import { ListView } from './components/views/ListView';
import { HeadlinesView } from './components/views/HeadlinesView';
import { MoodboardView } from './components/views/MoodboardView';
import { SelectionBar } from './components/SelectionBar';
import { BookmarkModal } from './components/BookmarkModal';
import { CollectionModal } from './components/CollectionModal';
import { ReaderModal } from './components/ReaderModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { Bookmark, Collection, extractUrlFromDataTransfer, extractBookmarksFromDataTransfer } from '@keepsake/shared';
import { BookmarkPlus, Inbox, Link2, FolderDown, CheckCircle2 } from 'lucide-react';

interface KeepsakeDashboardProps {
  store: ReturnType<typeof useKeepsakeStore>;
}

function KeepsakeDashboard({ store }: KeepsakeDashboardProps) {
  // Modals state
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [bookmarkToEdit, setBookmarkToEdit] = useState<Bookmark | null>(null);

  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [collectionToEdit, setCollectionToEdit] = useState<Collection | null>(null);

  const [readerBookmark, setReaderBookmark] = useState<Bookmark | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Ingest shared link from Android or Browser intent URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');
    const sharedTitle = params.get('title');

    if (sharedUrl) {
      // Clean query params from URL bar
      window.history.replaceState({}, document.title, window.location.pathname);

      setBookmarkToEdit({
        id: '',
        url: sharedUrl,
        title: sharedTitle || '',
        description: '',
        domain: '',
        collectionId: 'unsorted',
        tags: [],
        isFavorite: false,
        isTrash: false,
        type: 'link',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setIsBookmarkModalOpen(true);
    }
  }, []);

  // Determine current active collection details
  const currentCollection = store.collections.find((c) => c.id === store.activeCollectionId);
  const currentTitle =
    store.activeCollectionId === 'all'
      ? 'All Bookmarks'
      : store.activeCollectionId === 'unsorted'
      ? 'Unsorted Inbox'
      : store.activeCollectionId === 'favorites'
      ? 'Favorites'
      : store.activeCollectionId === 'trash'
      ? 'Trash'
      : currentCollection?.title || 'Bookmarks';

  const handleToggleSelect = (id: string) => {
    store.setSelectedBookmarkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEditBookmark = (bm: Bookmark) => {
    setBookmarkToEdit(bm);
    setIsBookmarkModalOpen(true);
  };

  const handleSaveBookmark = (data: any) => {
    if (bookmarkToEdit?.id) {
      store.updateBookmark(bookmarkToEdit.id, data);
    } else {
      store.addBookmark(data);
    }
    setBookmarkToEdit(null);
  };

  const handleEditCollection = (col: Collection) => {
    setCollectionToEdit(col);
    setIsCollectionModalOpen(true);
  };

  const handleSaveCollection = (data: any) => {
    if (collectionToEdit) {
      store.updateCollection(collectionToEdit.id, data);
    } else {
      store.addCollection(data);
    }
    setCollectionToEdit(null);
  };

  // Drag and drop URL from Chrome into category page
  const [isDraggingOverPage, setIsDraggingOverPage] = useState(false);
  const [dragDropToast, setDragDropToast] = useState<{ message: string; url: string } | null>(null);
  const dragCounterRef = useRef(0);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Prevent default browser behavior on dragover/drop anywhere on window so Chrome doesn't navigate away
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const showDropToast = (titleMessage: string, detail: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setDragDropToast({
      message: titleMessage,
      url: detail
    });
    toastTimeoutRef.current = setTimeout(() => {
      setDragDropToast(null);
    }, 4500);
  };

  const handleDropBookmarksOnCollection = async (
    items: Array<{ url: string; title?: string }>,
    targetColId: string
  ) => {
    const colName =
      targetColId === 'unsorted'
        ? 'Unsorted'
        : targetColId === 'favorites'
        ? 'Favorites'
        : store.collections.find((c) => c.id === targetColId)?.title || 'Unsorted';

    if (items.length === 1) {
      showDropToast(`Saved to ${colName}!`, items[0].title || items[0].url);
    } else {
      showDropToast(`Imported ${items.length} bookmarks into ${colName}!`, `${items.length} items added`);
    }

    await store.saveBookmarksToCollection(items, targetColId);
  };

  const handleDropUrlOnCollection = async (url: string, targetColId: string, initialTitle?: string) => {
    await handleDropBookmarksOnCollection([{ url, title: initialTitle }], targetColId);
  };

  const handleViewportDragEnter = (e: React.DragEvent) => {
    // Ignore internal reordering/moving of bookmarks within Keepsake
    if (e.dataTransfer.types.includes('keepsake/bookmark-id')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsDraggingOverPage(true);
    }
  };

  const handleViewportDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('keepsake/bookmark-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleViewportDragLeave = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('keepsake/bookmark-id')) return;
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOverPage(false);
    }
  };

  const handleViewportDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('keepsake/bookmark-id')) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOverPage(false);

    const droppedItems = await extractBookmarksFromDataTransfer(e.dataTransfer);
    if (droppedItems.length > 0) {
      const targetColId =
        store.activeCollectionId === 'all' || store.activeCollectionId === 'trash'
          ? 'unsorted'
          : store.activeCollectionId;
      await handleDropBookmarksOnCollection(droppedItems, targetColId);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-50 dark:bg-[#0c0c0e]">
      {/* Sidebar Navigation */}
      <Sidebar
        collections={store.collections}
        activeCollectionId={store.activeCollectionId}
        onSelectCollection={store.setActiveCollectionId}
        counts={store.counts}
        allTags={store.allTags}
        activeTag={store.activeTag}
        onSelectTag={store.setActiveTag}
        authSession={store.authSession}
        syncStatus={store.syncStatus}
        onSync={store.syncWithGoogleDrive}
        isDriveSyncEnabled={store.isDriveSyncEnabled}
        themeMode={store.themeMode}
        effectiveTheme={store.effectiveTheme}
        onCycleTheme={store.cycleThemeMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAddBookmark={() => {
          setBookmarkToEdit(null);
          setIsBookmarkModalOpen(true);
        }}
        onOpenAddCollection={() => {
          setCollectionToEdit(null);
          setIsCollectionModalOpen(true);
        }}
        onEditCollection={handleEditCollection}
        onDeleteCollection={store.deleteCollection}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onLogout={store.logout}
        onDropOnCollection={store.moveBookmarkToCollection}
        onDropUrlOnCollection={handleDropUrlOnCollection}
        onDropBookmarksOnCollection={handleDropBookmarksOnCollection}
        onDropOnTag={store.addTagToBookmark}
        onReorderCollections={store.reorderCollections}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header Bar */}
        <Header
          onToggleMobileMenu={() => setIsMobileSidebarOpen(true)}
          title={currentTitle}
          itemCount={store.bookmarks.length}
          collectionColor={currentCollection?.color}
          searchQuery={store.searchQuery}
          onSearchChange={store.setSearchQuery}
          activeTag={store.activeTag}
          onClearTag={() => store.setActiveTag(null)}
          viewMode={store.viewMode}
          onViewModeChange={store.setViewMode}
          selectedType={store.selectedType}
          onSelectType={store.setSelectedType}
          sortField={store.sortField}
          sortOrder={store.sortOrder}
          onSortChange={(field, order) => {
            store.setSortField(field);
            store.setSortOrder(order);
          }}
          onOpenAddBookmark={() => {
            setBookmarkToEdit(null);
            setIsBookmarkModalOpen(true);
          }}
        />

        {/* Bookmarks Viewport */}
        <main
          className="flex-1 overflow-y-auto relative"
          onDragEnter={handleViewportDragEnter}
          onDragOver={handleViewportDragOver}
          onDragLeave={handleViewportDragLeave}
          onDrop={handleViewportDrop}
        >
          {/* Visual Dropzone Overlay when dragging an external link/folder over the category page */}
          {isDraggingOverPage && (
            <div className="absolute inset-0 z-50 bg-sky-500/10 dark:bg-sky-500/15 backdrop-blur-sm border-2 border-dashed border-sky-500 rounded-2xl m-4 flex flex-col items-center justify-center pointer-events-none transition-all animate-in fade-in zoom-in-95 duration-150">
              <div className="w-16 h-16 rounded-2xl bg-sky-500 text-white shadow-xl shadow-sky-500/30 flex items-center justify-center mb-4 transform scale-110">
                <FolderDown className="w-8 h-8 stroke-[2.2]" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                Drop bookmark or folder to import into {currentTitle}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-sm text-center">
                Release to automatically import all bookmarks into {currentTitle}
              </p>
            </div>
          )}
          {store.bookmarks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-neutral-400">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-transparent dark:border-neutral-800 flex items-center justify-center mb-4 text-neutral-400">
                <Inbox className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-neutral-700 dark:text-neutral-200 mb-1">
                No bookmarks found
              </h3>
              <p className="text-xs text-neutral-500 max-w-sm mb-4">
                {store.searchQuery
                  ? 'No results matched your search criteria.'
                  : 'Your collection is empty. Save websites, articles, and videos to Keepsake.'}
              </p>
              <button
                onClick={() => {
                  setBookmarkToEdit(null);
                  setIsBookmarkModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold shadow-md shadow-sky-500/20 active:scale-95 flex items-center gap-1.5 transition-all"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>Add your first bookmark</span>
              </button>
            </div>
          ) : (
            <>
              {store.viewMode === 'cards' && (
                <CardsView
                  bookmarks={store.bookmarks}
                  selectedIds={store.selectedBookmarkIds}
                  onToggleSelect={handleToggleSelect}
                  onToggleFavorite={store.toggleFavorite}
                  onEdit={handleEditBookmark}
                  onDelete={store.moveToTrash}
                  onOpenReader={(bm) => setReaderBookmark(bm)}
                  cardSize={store.cardSize}
                />
              )}

              {store.viewMode === 'list' && (
                <ListView
                  bookmarks={store.bookmarks}
                  selectedIds={store.selectedBookmarkIds}
                  onToggleSelect={handleToggleSelect}
                  onToggleFavorite={store.toggleFavorite}
                  onEdit={handleEditBookmark}
                  onDelete={store.moveToTrash}
                  onOpenReader={(bm) => setReaderBookmark(bm)}
                />
              )}

              {store.viewMode === 'headlines' && (
                <HeadlinesView
                  bookmarks={store.bookmarks}
                  onToggleFavorite={store.toggleFavorite}
                  onEdit={handleEditBookmark}
                  onDelete={store.moveToTrash}
                  onOpenReader={(bm) => setReaderBookmark(bm)}
                />
              )}

              {store.viewMode === 'moodboard' && (
                <MoodboardView
                  bookmarks={store.bookmarks}
                  onToggleFavorite={store.toggleFavorite}
                  onEdit={handleEditBookmark}
                  onDelete={store.moveToTrash}
                  onOpenReader={(bm) => setReaderBookmark(bm)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Floating Bulk Selection Action Bar */}
      <SelectionBar
        selectedCount={store.selectedBookmarkIds.size}
        collections={store.collections}
        onDeselectAll={() => store.setSelectedBookmarkIds(new Set())}
        onBulkMove={store.bulkMove}
        onBulkAddTag={store.bulkAddTag}
        onBulkFavorite={store.bulkFavorite}
        onBulkDelete={store.bulkDelete}
      />

      {/* Modals */}
      <BookmarkModal
        isOpen={isBookmarkModalOpen}
        onClose={() => setIsBookmarkModalOpen(false)}
        onSave={handleSaveBookmark}
        bookmarkToEdit={bookmarkToEdit}
        collections={store.collections}
        availableTags={store.allTags}
        defaultCollectionId={store.activeCollectionId}
      />

      <CollectionModal
        isOpen={isCollectionModalOpen}
        onClose={() => setIsCollectionModalOpen(false)}
        onSave={handleSaveCollection}
        collectionToEdit={collectionToEdit}
      />

      <ReaderModal
        bookmark={readerBookmark}
        onClose={() => setReaderBookmark(null)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        authSession={store.authSession}
        onSetAuthSession={store.setAuthSession}
        syncStatus={store.syncStatus}
        onSync={store.syncWithGoogleDrive}
        bookmarks={store.store.bookmarks}
        collections={store.collections}
        onImport={store.importData}
        themeMode={store.themeMode}
        effectiveTheme={store.effectiveTheme}
        onSelectThemeMode={store.setThemeMode}
        cardSize={store.cardSize}
        onSelectCardSize={store.setCardSize}
        isDriveSyncEnabled={store.isDriveSyncEnabled}
        onToggleDriveSync={store.setDriveSyncEnabled}
        onLogout={store.logout}
      />

      {/* Drag & Drop URL Notification Toast */}
      {dragDropToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-neutral-900/95 dark:bg-white/95 text-white dark:text-neutral-900 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 border border-white/10 dark:border-black/10 animate-in slide-in-from-bottom-5 duration-200">
          <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold leading-tight">{dragDropToast.message}</div>
            <div className="text-[11px] opacity-70 truncate font-mono mt-0.5">{dragDropToast.url}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const store = useKeepsakeStore();

  // If user is not authenticated, render LoginScreen gate
  if (!store.authSession) {
    return (
      <LoginScreen
        onLoginSuccess={store.setAuthSession}
        themeMode={store.themeMode}
        effectiveTheme={store.effectiveTheme}
        onCycleTheme={store.cycleThemeMode}
      />
    );
  }

  // Once authenticated, mount the full Keepsake application cleanly
  return <KeepsakeDashboard store={store} />;
}
