import { timingSafeEqual } from 'node:crypto';
export function createApiAuth(token) {
    if (!token || token.length < 32)
        throw new Error('KEEPSAKE_API_TOKEN must contain at least 32 characters');
    const expected = Buffer.from(token, 'utf8');
    return (req, res, next) => {
        const publicRoute = (req.method === 'GET' && ['/health', '/auth/config', '/auth/google/url', '/auth/google/callback'].includes(req.path)) || (req.method === 'POST' && req.path === '/auth/refresh');
        if (req.method === 'OPTIONS' || publicRoute)
            return next();
        const header = req.get('authorization') || '';
        const supplied = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '', 'utf8');
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            return res.status(401).json({ error: 'A valid Keepsake API token is required' });
        }
        return next();
    };
}
