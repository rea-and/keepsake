import { createHash, randomBytes } from 'node:crypto';
const NONCE_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 1000;
const sha256Base64Url = (value) => createHash('sha256').update(value).digest('base64url');
export function parseFlow(value) {
    return value === 'extension' || value === 'android' ? value : 'web';
}
export function isValidChallenge(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export class LoginFlowStore {
    now;
    pending = new Map();
    codes = new Map();
    constructor(now = Date.now) {
        this.now = now;
    }
    begin(flow, challenge) {
        this.sweep();
        const nonce = randomBytes(16).toString('hex');
        this.pending.set(nonce, { flow, challenge, expires: this.now() + NONCE_TTL_MS });
        return nonce;
    }
    /** Single use: a nonce can finish one sign-in only. */
    consume(nonce) {
        const entry = this.pending.get(nonce);
        this.pending.delete(nonce);
        if (!entry || entry.expires < this.now())
            return null;
        return { flow: entry.flow, challenge: entry.challenge };
    }
    issueCode(data, challenge) {
        this.sweep();
        const code = randomBytes(24).toString('base64url');
        this.codes.set(code, { data, challenge, expires: this.now() + CODE_TTL_MS });
        return code;
    }
    /** Single use, and only with the verifier whose hash was registered as the challenge. */
    redeemCode(code, verifier) {
        const entry = this.codes.get(code);
        this.codes.delete(code);
        if (!entry || entry.expires < this.now())
            return null;
        return sha256Base64Url(verifier) === entry.challenge ? entry.data : null;
    }
    sweep() {
        const now = this.now();
        for (const [key, value] of this.pending)
            if (value.expires < now)
                this.pending.delete(key);
        for (const [key, value] of this.codes)
            if (value.expires < now)
                this.codes.delete(key);
        // Bound memory if someone floods /google/url.
        while (this.pending.size >= MAX_ENTRIES)
            this.pending.delete(this.pending.keys().next().value);
        while (this.codes.size >= MAX_ENTRIES)
            this.codes.delete(this.codes.keys().next().value);
    }
}
