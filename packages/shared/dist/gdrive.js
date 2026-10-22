"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleDriveClient = void 0;
const DRIVE_FILE_NAME = 'keepsake_store_v1.json';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
class GoogleDriveClient {
    accessToken;
    constructor(accessToken) {
        this.accessToken = accessToken;
    }
    setAccessToken(token) {
        this.accessToken = token;
    }
    async fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return res;
        }
        catch (err) {
            if (err.name === 'AbortError') {
                throw new Error(`Google Drive request timed out after ${Math.round(timeoutMs / 1000)}s`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
    /**
     * Fetches the authenticated Google User's profile
     */
    async getUserProfile() {
        const res = await this.fetchWithTimeout(USERINFO_ENDPOINT, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            }
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch Google user profile: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return {
            id: data.sub,
            email: data.email,
            name: data.name || data.email,
            picture: data.picture,
            givenName: data.given_name,
            familyName: data.family_name
        };
    }
    /**
     * Finds the existing Keepsake store file in Google Drive AppData folder
     */
    async findAppDataStoreFile() {
        const query = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`);
        const url = `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`;
        const res = await this.fetchWithTimeout(url, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            }
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to query Google Drive appDataFolder: ${res.status} - ${errText}`);
        }
        const json = await res.json();
        if (json.files && json.files.length > 0) {
            return {
                id: json.files[0].id,
                modifiedTime: json.files[0].modifiedTime
            };
        }
        return null;
    }
    /**
     * Reads and parses the Keepsake data store from Google Drive
     */
    async readStore(fileId) {
        const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
        const res = await this.fetchWithTimeout(url, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            }
        });
        if (!res.ok) {
            throw new Error(`Failed to read Keepsake store from Drive: ${res.status}`);
        }
        const store = await res.json();
        return store;
    }
    /**
     * Saves or updates the Keepsake data store in Google Drive AppData folder
     */
    async saveStore(store, existingFileId) {
        const content = JSON.stringify(store, null, 2);
        if (existingFileId) {
            // Update existing file (PATCH upload)
            const uploadUrl = `${UPLOAD_API_BASE}/files/${existingFileId}?uploadType=media`;
            const res = await this.fetchWithTimeout(uploadUrl, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: content
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to update store file in Drive: ${res.status} - ${err}`);
            }
            const updated = await res.json();
            return updated.id;
        }
        else {
            // Create new file in appDataFolder using multipart upload
            const metadata = {
                name: DRIVE_FILE_NAME,
                parents: ['appDataFolder'],
                mimeType: 'application/json'
            };
            const boundary = '-------KeepsakeBoundary' + Math.random().toString(36).substring(2);
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;
            const multipartBody = delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                content +
                closeDelimiter;
            const uploadUrl = `${UPLOAD_API_BASE}/files?uploadType=multipart`;
            const res = await this.fetchWithTimeout(uploadUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: multipartBody
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to create store file in Drive: ${res.status} - ${err}`);
            }
            const created = await res.json();
            return created.id;
        }
    }
    /**
     * Exports an HTML or JSON backup file to a visible "Keepsake" folder in the user's Google Drive
     */
    async exportBackupToDriveFolder(fileName, content, mimeType = 'text/html') {
        // 1. Check or create "Keepsake" folder in root Drive
        const folderQuery = encodeURIComponent("name = 'Keepsake' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const searchFolderUrl = `${DRIVE_API_BASE}/files?q=${folderQuery}&fields=files(id,name)`;
        const searchRes = await this.fetchWithTimeout(searchFolderUrl, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
        });
        const folderSearch = await searchRes.json();
        let folderId;
        if (folderSearch.files && folderSearch.files.length > 0) {
            folderId = folderSearch.files[0].id;
        }
        else {
            // Create folder
            const createFolderRes = await this.fetchWithTimeout(`${DRIVE_API_BASE}/files`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Keepsake',
                    mimeType: 'application/vnd.google-apps.folder'
                })
            });
            const folderData = await createFolderRes.json();
            folderId = folderData.id;
        }
        // 2. Upload file into the folder
        const metadata = {
            name: fileName,
            parents: [folderId],
            mimeType
        };
        const boundary = '-------KeepsakeBackup' + Math.random().toString(36).substring(2);
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        const multipartBody = delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            `Content-Type: ${mimeType}\r\n\r\n` +
            content +
            closeDelimiter;
        const uploadUrl = `${UPLOAD_API_BASE}/files?uploadType=multipart`;
        const res = await this.fetchWithTimeout(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });
        if (!res.ok) {
            throw new Error(`Failed to upload backup to Keepsake folder: ${res.status}`);
        }
        const file = await res.json();
        return file.id;
    }
}
exports.GoogleDriveClient = GoogleDriveClient;
//# sourceMappingURL=gdrive.js.map