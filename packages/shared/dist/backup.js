"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBackup = parseBackup;
/** Validate a Keepsake backup before it reaches the sync merge. */
function parseBackup(content) {
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('Backup must be a JSON object');
    const raw = data;
    if (!Array.isArray(raw.bookmarks) || !Array.isArray(raw.collections))
        throw new Error('Backup must contain bookmark and collection lists');
    if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)
        throw new Error('Unsupported backup schema version');
    const validDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
    for (const item of raw.bookmarks) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || typeof item.url !== 'string' || typeof item.title !== 'string' || typeof item.domain !== 'string' || typeof item.description !== 'string' || !Array.isArray(item.tags) || !item.tags.every((tag) => typeof tag === 'string') || !validDate(item.createdAt) || !validDate(item.updatedAt))
            throw new Error('Backup contains an invalid bookmark');
    }
    for (const item of raw.collections) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || typeof item.sortOrder !== 'number' || !validDate(item.createdAt) || !validDate(item.updatedAt))
            throw new Error('Backup contains an invalid collection');
    }
    const tombstones = raw.tombstones ?? [];
    if (!Array.isArray(tombstones) || tombstones.some((item) => !item || typeof item.id !== 'string' || !item.id || !['bookmark', 'collection'].includes(item.type) || !validDate(item.deletedAt)))
        throw new Error('Backup contains invalid deletion records');
    const savedSearches = raw.savedSearches ?? [];
    if (!Array.isArray(savedSearches) || savedSearches.some((item) => !item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || typeof item.query !== 'string' || !validDate(item.updatedAt) || (item.deletedAt !== undefined && !validDate(item.deletedAt))))
        throw new Error('Backup contains invalid saved searches');
    return {
        version: typeof raw.version === 'number' ? raw.version : 1,
        schemaVersion: 1,
        lastModified: validDate(raw.lastModified) ? raw.lastModified : new Date().toISOString(),
        deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : 'backup',
        bookmarks: raw.bookmarks,
        collections: raw.collections,
        tombstones: tombstones,
        savedSearches: savedSearches
    };
}
//# sourceMappingURL=backup.js.map