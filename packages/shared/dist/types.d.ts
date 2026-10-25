/**
 * Keepsake - Shared Types and Domain Models
 * A beautiful, self-hosted, Google Drive-synced bookmark manager
 */
export type BookmarkType = 'link' | 'article' | 'image' | 'video' | 'document' | 'audio';
export type ViewMode = 'cards' | 'list' | 'headlines' | 'moodboard';
export type SortField = 'createdAt' | 'updatedAt' | 'title' | 'domain';
export type SortOrder = 'asc' | 'desc';
export interface ReaderContent {
    title?: string;
    byline?: string;
    content?: string;
    textContent?: string;
    length?: number;
    excerpt?: string;
    siteName?: string;
}
export interface Bookmark {
    id: string;
    url: string;
    title: string;
    description: string;
    excerpt?: string;
    note?: string;
    domain: string;
    favicon?: string;
    cover?: string;
    collectionId: string;
    tags: string[];
    isFavorite: boolean;
    isTrash: boolean;
    type: BookmarkType;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
    readerContent?: ReaderContent;
}
export interface Collection {
    id: string;
    title: string;
    slug?: string;
    description?: string;
    parentId?: string | null;
    icon?: string;
    color?: string;
    isSystem?: boolean;
    sortOrder: number;
    defaultViewMode?: ViewMode;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}
export interface Tag {
    name: string;
    count: number;
}
export interface UserProfile {
    id: string;
    email: string;
    name: string;
    picture?: string;
    givenName?: string;
    familyName?: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    scope?: string;
}
export interface AuthSession {
    user: UserProfile;
    tokens: AuthTokens;
}
export interface SyncTombstone {
    id: string;
    type: 'bookmark' | 'collection';
    deletedAt: string;
}
export interface KeepsakeDataStore {
    version: number;
    schemaVersion: number;
    lastModified: string;
    deviceId: string;
    collections: Collection[];
    bookmarks: Bookmark[];
    tombstones: SyncTombstone[];
}
export interface SyncStatus {
    isSyncing: boolean;
    lastSyncedAt: string | null;
    error: string | null;
    remoteModifiedAt?: string | null;
    syncedItemCount?: number;
}
export interface ScrapedMetadata {
    url: string;
    title: string;
    description: string;
    domain: string;
    favicon?: string;
    cover?: string;
    type: BookmarkType;
    siteName?: string;
    readerContent?: ReaderContent;
}
export interface ParsedSearchQuery {
    text: string;
    tags: string[];
    domain?: string;
    isFavorite?: boolean;
    collectionId?: string;
    type?: BookmarkType;
    hasNote?: boolean;
}
export interface ImportSummary {
    bookmarksImported: number;
    collectionsCreated: number;
    tagsFound: number;
    errors: string[];
}
//# sourceMappingURL=types.d.ts.map