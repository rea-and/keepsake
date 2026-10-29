export function hasBookmarkConflict(existing, baseUpdatedAt) {
    return baseUpdatedAt === null ? Boolean(existing) : !existing || existing.updatedAt !== baseUpdatedAt;
}
