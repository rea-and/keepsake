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

interface SessionRecord {
  email: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface SessionVerifier {
  verify(token: string): { email: string } | null;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(allowed: string[], email: unknown, emailVerified: unknown): boolean {
  return typeof email === 'string' && emailVerified === true && allowed.includes(email.trim().toLowerCase());
}

export class SessionStore implements SessionVerifier {
  private sessions: Record<string, SessionRecord> = {};

  constructor(private readonly filePath: string, private readonly now: () => number = Date.now) {
    if (!fs.existsSync(filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.sessions = parsed;
    } catch (err) {
      // Never overwrite a file we could not read; signing in again is the safe fallback.
      console.error(`[Server] Unable to read ${filePath}; existing sessions are ignored:`, err);
    }
  }

  create(email: string): string {
    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const now = this.now();
    this.sessions[hashToken(token)] = { email: email.trim().toLowerCase(), createdAt: now, lastUsedAt: now };
    this.prune();
    this.persist();
    return token;
  }

  verify(token: string): { email: string } | null {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const key = hashToken(token);
    const record = this.sessions[key];
    if (!record) return null;
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

  revoke(token: string): boolean {
    const key = hashToken(token);
    if (!this.sessions[key]) return false;
    delete this.sessions[key];
    this.persist();
    return true;
  }

  /** Removing an address from KEEPSAKE_ALLOWED_EMAILS also ends its sessions. */
  revokeWhere(keep: (email: string) => boolean): void {
    let changed = false;
    for (const [key, record] of Object.entries(this.sessions)) {
      if (!keep(record.email)) {
        delete this.sessions[key];
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private prune(): void {
    const cutoff = this.now() - IDLE_EXPIRY_MS;
    for (const [key, record] of Object.entries(this.sessions)) {
      if (record.lastUsedAt < cutoff) delete this.sessions[key];
    }
  }

  private persist(): void {
    const tmpPath = `${this.filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmpPath, JSON.stringify(this.sessions), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      try { fs.rmSync(tmpPath, { force: true }); } catch {}
      throw err;
    }
  }
}
