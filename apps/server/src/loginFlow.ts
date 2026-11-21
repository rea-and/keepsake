import { createHash, randomBytes } from 'node:crypto';

/**
 * Short-lived, in-memory state for the Google sign-in flows.
 *
 * - A login "nonce" ties the browser that starts a sign-in to the browser that
 *   finishes it (it is also kept in an httpOnly cookie), so a link someone else
 *   crafted cannot complete a sign-in in your browser.
 * - For the Android app the callback does not hand credentials to the keepsake://
 *   link (any installed app can register that scheme). It hands over a one-time
 *   code instead, which only the app holding the matching PKCE verifier can redeem.
 */

export type LoginFlow = 'web' | 'extension' | 'android';

const NONCE_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 1000;

const sha256Base64Url = (value: string) => createHash('sha256').update(value).digest('base64url');

export function parseFlow(value: unknown): LoginFlow {
  return value === 'extension' || value === 'android' ? value : 'web';
}

export function isValidChallenge(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

interface PendingLogin { flow: LoginFlow; challenge?: string; expires: number }
interface LoginCode<T> { data: T; challenge: string; expires: number }

export class LoginFlowStore<T = unknown> {
  private pending = new Map<string, PendingLogin>();
  private codes = new Map<string, LoginCode<T>>();

  constructor(private readonly now: () => number = Date.now) {}

  begin(flow: LoginFlow, challenge?: string): string {
    this.sweep();
    const nonce = randomBytes(16).toString('hex');
    this.pending.set(nonce, { flow, challenge, expires: this.now() + NONCE_TTL_MS });
    return nonce;
  }

  /** Single use: a nonce can finish one sign-in only. */
  consume(nonce: string): { flow: LoginFlow; challenge?: string } | null {
    const entry = this.pending.get(nonce);
    this.pending.delete(nonce);
    if (!entry || entry.expires < this.now()) return null;
    return { flow: entry.flow, challenge: entry.challenge };
  }

  issueCode(data: T, challenge: string): string {
    this.sweep();
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, { data, challenge, expires: this.now() + CODE_TTL_MS });
    return code;
  }

  /** Single use, and only with the verifier whose hash was registered as the challenge. */
  redeemCode(code: string, verifier: string): T | null {
    const entry = this.codes.get(code);
    this.codes.delete(code);
    if (!entry || entry.expires < this.now()) return null;
    return sha256Base64Url(verifier) === entry.challenge ? entry.data : null;
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, value] of this.pending) if (value.expires < now) this.pending.delete(key);
    for (const [key, value] of this.codes) if (value.expires < now) this.codes.delete(key);
    // Bound memory if someone floods /google/url.
    while (this.pending.size >= MAX_ENTRIES) this.pending.delete(this.pending.keys().next().value as string);
    while (this.codes.size >= MAX_ENTRIES) this.codes.delete(this.codes.keys().next().value as string);
  }
}
