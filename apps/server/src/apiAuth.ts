import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { SessionVerifier } from './sessions.js';

export interface ApiAuthOptions {
  /** Per-device sessions minted at Google sign-in. */
  sessions?: SessionVerifier;
  /** Optional static token for scripts and older installs (KEEPSAKE_API_TOKEN). */
  legacyToken?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Bearer token the request authenticated with, set by createApiAuth. */
    apiBearer?: string;
  }
}

export function createApiAuth({ sessions, legacyToken }: ApiAuthOptions) {
  if (legacyToken && legacyToken.length < 32) throw new Error('KEEPSAKE_API_TOKEN must contain at least 32 characters when set');
  if (!sessions && !legacyToken) throw new Error('API authentication needs a session verifier or KEEPSAKE_API_TOKEN');
  const legacy = legacyToken ? Buffer.from(legacyToken, 'utf8') : null;

  return (req: Request, res: Response, next: NextFunction) => {
    const publicRoute = (req.method === 'GET' && ['/health', '/auth/config', '/auth/google/url', '/auth/google/callback'].includes(req.path)) || (req.method === 'POST' && req.path === '/auth/refresh');
    if (req.method === 'OPTIONS' || publicRoute) return next();
    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (bearer) {
      const supplied = Buffer.from(bearer, 'utf8');
      const legacyMatch = legacy !== null && supplied.length === legacy.length && timingSafeEqual(supplied, legacy);
      if (legacyMatch || sessions?.verify(bearer)) {
        req.apiBearer = bearer;
        return next();
      }
    }
    return res.status(401).json({ error: 'Sign in to Keepsake to use the API' });
  };
}
