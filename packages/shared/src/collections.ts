import { Collection } from './types.js';

export function canSetCollectionParent(collections: Collection[], id: string | undefined, parentId: string | null | undefined): boolean {
  if (!parentId) return true;
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const seen = new Set<string>();
  let current: string | null | undefined = parentId;
  while (current) {
    if (current === id || seen.has(current)) return false;
    seen.add(current);
    const parent = byId.get(current);
    if (!parent || parent.isSystem || parent.id === 'unsorted') return false;
    current = parent.parentId;
  }
  return true;
}

export function flattenCollections(collections: Collection[]): Array<{ collection: Collection; depth: number }> {
  const custom = collections.filter((col) => !col.isSystem && col.id !== 'unsorted').slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const byId = new Map(custom.map((col) => [col.id, col]));
  const children = new Map<string | null, Collection[]>();
  for (const col of custom) {
    const parent = col.parentId && byId.has(col.parentId) ? col.parentId : null;
    children.set(parent, [...(children.get(parent) || []), col]);
  }
  const result: Array<{ collection: Collection; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (col: Collection, depth: number) => {
    if (visited.has(col.id)) return;
    visited.add(col.id);
    result.push({ collection: col, depth });
    for (const child of children.get(col.id) || []) visit(child, depth + 1);
  };
  for (const root of children.get(null) || []) visit(root, 0);
  // Keep malformed or cyclic imported data visible and navigable.
  for (const col of custom) visit(col, 0);
  return result;
}
