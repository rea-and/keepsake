import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { READER_PURIFY_CONFIG } from '@keepsake/shared';
const purify = createDOMPurify(new JSDOM('').window);
purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
});
/** Cleans untrusted article HTML. Fails closed: if cleaning throws, nothing is returned. */
export function sanitizeReaderHtml(html) {
    try {
        return purify.sanitize(html, READER_PURIFY_CONFIG);
    }
    catch {
        return '';
    }
}
/**
 * Reader content can arrive from any client (POST, PUT, sync, import), not only from
 * the scraper, so its HTML is cleaned before it is stored. Content identical to what is
 * already stored was cleaned when it was saved and is not processed again.
 */
export function cleanReaderContent(incoming, stored) {
    if (!incoming || typeof incoming.content !== 'string' || incoming.content === '')
        return incoming;
    if (stored?.content === incoming.content)
        return incoming;
    return { ...incoming, content: sanitizeReaderHtml(incoming.content) };
}
