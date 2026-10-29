export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const config = await chrome.storage.local.get(['serverUrl', 'apiToken']);
  const configured = (config.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const target = new URL(url);
  const configuredUrl = new URL(configured);
  const headers = new Headers(init.headers);
  if (config.apiToken && target.origin === configuredUrl.origin && target.pathname.startsWith(`${configuredUrl.pathname.replace(/\/$/, '')}/api/`)) {
    headers.set('Authorization', `Bearer ${config.apiToken}`);
  }
  return fetch(url, { ...init, headers });
}
