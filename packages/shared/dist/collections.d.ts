import { Collection } from './types.js';
export declare function canSetCollectionParent(collections: Collection[], id: string | undefined, parentId: string | null | undefined): boolean;
export declare function flattenCollections(collections: Collection[]): Array<{
    collection: Collection;
    depth: number;
}>;
//# sourceMappingURL=collections.d.ts.map