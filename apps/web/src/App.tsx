import React, { useState, useEffect } from 'react';
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
import { Bookmark, Collection } from '@keepsake/shared';
import { BookmarkPlus, Inbox } from 'lucide-react';

export function App() {
  const store = useKeepsakeStore();

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
        <main className="flex-1 overflow-y-auto">
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
      />
    </div>
  );
}
