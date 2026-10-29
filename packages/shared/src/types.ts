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
  content?: string; // Cleaned reader HTML
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
  note?: string; // User's personal markdown note
  domain: string;
  favicon?: string;
  cover?: string; // Preview image URL
  collectionId: string; // 'unsorted' or UUID of collection
  tags: string[];
  isFavorite: boolean;
  isTrash: boolean;
  isDone?: boolean;
  type: BookmarkType;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  deletedAt?: string | null;
  readerContent?: ReaderContent;
}

export interface Collection {
  id: string;
  title: string;
  slug?: string; // Optional URL slug e.g. "mac-apps"
  description?: string;
  parentId?: string | null; // For nested sub-collections
  icon?: string; // Lucide icon name or emoji e.g. "Folder", "BookOpen", "Code", "🎨"
  color?: string; // Hex color code e.g. "#3b82f6"
  isSystem?: boolean; // 'all', 'unsorted', 'trash'
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
  expiresAt: number; // Unix timestamp in ms
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

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface KeepsakeDataStore {
  version: number;
  schemaVersion: number;
  lastModified: string; // ISO 8601
  deviceId: string;
  collections: Collection[];
  bookmarks: Bookmark[];
  tombstones: SyncTombstone[];
  savedSearches?: SavedSearch[];
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
  terms?: string[];
  excludedTerms?: string[];
  tags: string[];
  domain?: string;
  isFavorite?: boolean;
  isDone?: boolean;
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
