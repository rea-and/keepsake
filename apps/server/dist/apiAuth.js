import { timingSafeEqual } from 'node:crypto';
export function createApiAuth({ sessions, legacyToken }) {
    if (legacyToken && legacyToken.length < 32)
        throw new Error('KEEPSAKE_API_TOKEN must contain at least 32 characters when set');
    if (!sessions && !legacyToken)
        throw new Error('API authentication needs a session verifier or KEEPSAKE_API_TOKEN');
    const legacy = legacyToken ? Buffer.from(legacyToken, 'utf8') : null;
    return (req, res, next) => {
        const publicRoute = (req.method === 'GET' && ['/health', '/auth/config', '/auth/google/url', '/auth/google/callback'].includes(req.path)) || (req.method === 'POST' && req.path === '/auth/exchange');
        if (req.method === 'OPTIONS' || publicRoute)
            return next();
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
