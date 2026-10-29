import type { Bookmark } from '@keepsake/shared';

export function hasBookmarkConflict(existing: Bookmark | undefined, baseUpdatedAt: string | null): boolean {
  return baseUpdatedAt === null ? Boolean(existing) : !existing || existing.updatedAt !== baseUpdatedAt;
}
