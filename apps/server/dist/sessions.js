import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
/**
 * Per-device API sessions.
 *
 * A session token is minted on the server when an allowed Google account signs
 * in, and is handed straight to the signing-in client. Nothing has to be
 * copied between the server and its clients by hand. Only a SHA-256 hash of
 * each token is stored, so a leaked sessions file cannot be replayed.
 */
const TOKEN_PREFIX = 'ks_';
const IDLE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export function parseAllowedEmails(raw) {
    return (raw || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}
export function isEmailAllowed(allowed, email, emailVerified) {
    return typeof email === 'string' && emailVerified === true && allowed.includes(email.trim().toLowerCase());
}
export class SessionStore {
    filePath;
    now;
    sessions = {};
    constructor(filePath, now = Date.now) {
        this.filePath = filePath;
        this.now = now;
        if (!fs.existsSync(filePath))
            return;
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                this.sessions = parsed;
        }
        catch (err) {
            // Keep the unreadable file for inspection instead of overwriting it; signing in again is the safe fallback.
            const aside = `${filePath}.corrupt-${this.now()}`;
            try {
                fs.renameSync(filePath, aside);
            }
            catch { }
            console.error(`[Server] Unable to read ${filePath}; moved it to ${aside} and starting with no sessions:`, err);
        }
        this.prune();
    }
    create(email, extra = {}) {
        const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
        const now = this.now();
        this.sessions[hashToken(token)] = { email: email.trim().toLowerCase(), createdAt: now, lastUsedAt: now, ...(extra.googleRefreshToken ? { googleRefreshToken: extra.googleRefreshToken } : {}), ...(extra.label ? { label: extra.label.slice(0, 100) } : {}) };
        this.prune();
        this.persist();
        return token;
    }
    verify(token) {
        if (!token.startsWith(TOKEN_PREFIX))
            return null;
        const key = hashToken(token);
        const record = this.sessions[key];
        if (!record)
            return null;
        const now = this.now();
        if (now - record.lastUsedAt > IDLE_EXPIRY_MS) {
            delete this.sessions[key];
            this.persist();
            return null;
        }
        if (now - record.lastUsedAt > TOUCH_INTERVAL_MS) {
            record.lastUsedAt = now;
            this.persist();
        }
        return { email: record.email };
    }
    /** Public identifier of a session (a prefix of its hash); it cannot be used to sign in. */
    idOf(token) {
        return hashToken(token).slice(0, 16);
    }
    /** Sessions of one account (or every account when `email` is omitted), newest activity first. */
    list(email) {
        return Object.entries(this.sessions)
            .filter(([, record]) => !email || record.email === email)
            .map(([key, record]) => ({ id: key.slice(0, 16), label: record.label || 'Unknown device', email: record.email, createdAt: record.createdAt, lastUsedAt: record.lastUsedAt }))
            .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    }
    revokeById(id, email) {
        const key = Object.keys(this.sessions).find((candidate) => candidate.slice(0, 16) === id && (!email || this.sessions[candidate].email === email));
        if (!key)
            return false;
        delete this.sessions[key];
        this.persist();
        return true;
    }
    getGoogleRefreshToken(token) {
        return this.sessions[hashToken(token)]?.googleRefreshToken;
    }
    revoke(token) {
        const key = hashToken(token);
        if (!this.sessions[key])
            return false;
        delete this.sessions[key];
        this.persist();
        return true;
    }
    /** Removing an address from KEEPSAKE_ALLOWED_EMAILS also ends its sessions. */
    revokeWhere(keep) {
        let changed = false;
        for (const [key, record] of Object.entries(this.sessions)) {
            if (!keep(record.email)) {
                delete this.sessions[key];
                changed = true;
            }
        }
        if (changed)
            this.persist();
    }
    prune() {
        const cutoff = this.now() - IDLE_EXPIRY_MS;
        for (const [key, record] of Object.entries(this.sessions)) {
            if (record.lastUsedAt < cutoff)
                delete this.sessions[key];
        }
    }
    persist() {
        const tmpPath = `${this.filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(tmpPath, JSON.stringify(this.sessions), { encoding: 'utf-8', mode: 0o600 });
            fs.renameSync(tmpPath, this.filePath);
        }
        catch (err) {
            try {
                fs.rmSync(tmpPath, { force: true });
            }
            catch { }
            throw err;
        }
    }
}
