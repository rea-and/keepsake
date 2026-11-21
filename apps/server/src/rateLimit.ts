import type { Request, Response, NextFunction } from 'express';

/** Fixed-window limiter keyed by client address. Small and in memory: enough to blunt abuse of the public sign-in routes. */
export function createRateLimiter({ windowMs, max, now = Date.now }: { windowMs: number; max: number; now?: () => number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const time = now();
    if (hits.size > 5000) for (const [key, entry] of hits) if (entry.resetAt <= time) hits.delete(key);
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      entry = { count: 0, resetAt: time + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - time) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
    }
    return next();
  };
}
