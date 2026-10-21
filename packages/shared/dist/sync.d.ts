import { KeepsakeDataStore } from './types.js';
export interface MergeResult {
    mergedStore: KeepsakeDataStore;
    hasLocalChanges: boolean;
    hasRemoteChanges: boolean;
    bookmarksUpdated: number;
    collectionsUpdated: number;
}
/**
 * Merges a local data store with a remote data store using Last-Write-Wins (LWW)
 * and tombstone propagation for safe deletions.
 */
export declare function mergeStores(local: KeepsakeDataStore, remote: KeepsakeDataStore | null, currentDeviceId: string): MergeResult;
/**
 * Creates an empty default Keepsake store
 */
export declare function createDefaultStore(deviceId: string): KeepsakeDataStore;
//# sourceMappingURL=sync.d.ts.map