import { KeepsakeDataStore, UserProfile } from './types.js';
export declare class GoogleDriveClient {
    private accessToken;
    constructor(accessToken: string);
    setAccessToken(token: string): void;
    /**
     * Fetches the authenticated Google User's profile
     */
    getUserProfile(): Promise<UserProfile>;
    /**
     * Finds the existing Keepsake store file in Google Drive AppData folder
     */
    findAppDataStoreFile(): Promise<{
        id: string;
        modifiedTime: string;
    } | null>;
    /**
     * Reads and parses the Keepsake data store from Google Drive
     */
    readStore(fileId: string): Promise<KeepsakeDataStore>;
    /**
     * Saves or updates the Keepsake data store in Google Drive AppData folder
     */
    saveStore(store: KeepsakeDataStore, existingFileId?: string | null): Promise<string>;
    /**
     * Exports an HTML or JSON backup file to a visible "Keepsake" folder in the user's Google Drive
     */
    exportBackupToDriveFolder(fileName: string, content: string, mimeType?: string): Promise<string>;
}
//# sourceMappingURL=gdrive.d.ts.map