/** A short, human label for a signed-in device, shown in the "Devices" list. */
export function describeClient(flow, userAgent) {
    if (flow === 'android')
        return 'Android app';
    const ua = userAgent || '';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : '';
    const base = os ? `${browser} on ${os}` : browser;
    return flow === 'extension' ? `Browser extension (${base})` : `Web app (${base})`;
}
