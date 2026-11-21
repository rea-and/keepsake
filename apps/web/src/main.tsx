import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const nativeFetch = window.fetch.bind(window);

// Routes that work without a session; they never carry or trigger the expired-session handling.
const isPublicApiPath = (pathname: string) =>
  pathname === '/api/health' || pathname === '/api/auth/config' || pathname === '/api/auth/exchange' || pathname.startsWith('/api/auth/google/');

// Once the server has rejected a session token, requests that would use it are answered locally with
// 401 instead of hitting the server again (an import can fire thousands), and the app is told once so
// it can ask the user to sign in. A new sign-in produces a new token and is not affected.
let rejectedToken: string | null = null;

window.fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
    let token: string | null = null;
    try {
      token = JSON.parse(localStorage.getItem('keepsake_auth_session') || 'null')?.apiToken || null;
    } catch {}
    const tracked = Boolean(token) && !isPublicApiPath(url.pathname);
    if (tracked && token === rejectedToken) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'Your session expired. Sign in again.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    }
    if (token) {
      const headers = new Headers(request.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const response = nativeFetch(new Request(request, { headers }));
      return tracked
        ? response.then((res) => {
            if (res.status === 401 && token !== rejectedToken) {
              rejectedToken = token;
              window.dispatchEvent(new Event('keepsake:session-expired'));
            }
            return res;
          })
        : response;
    }
  }
  return nativeFetch(request);
};

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.warn('[Keepsake] Offline app shell registration failed:', error);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
