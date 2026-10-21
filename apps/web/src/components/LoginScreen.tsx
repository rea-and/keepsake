import React, { useState, useEffect, useCallback } from 'react';
import { AuthSession } from '@keepsake/shared';
import {
  Bookmark,
  ShieldCheck,
  Cloud,
  Sparkles,
  BookOpen,
  Sun,
  Moon,
  Monitor,
  AlertCircle,
  ExternalLink,
  Lock,
  Loader2
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (session: AuthSession) => void;
  themeMode: 'system' | 'light' | 'dark';
  effectiveTheme: 'light' | 'dark';
  onCycleTheme: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  themeMode,
  effectiveTheme,
  onCycleTheme
}) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check if session was already stored via redirect flow or popup storage event
  const checkStored = useCallback(() => {
    try {
      const raw = localStorage.getItem('keepsake_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user && parsed?.tokens) {
          onLoginSuccess(parsed);
        }
      }
    } catch {}
  }, [onLoginSuccess]);

  useEffect(() => {
    checkStored();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'KEEPSAKE_AUTH_SUCCESS' && event.data.payload) {
        setIsAuthenticating(false);
        setAuthError(null);
        onLoginSuccess(event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', checkStored);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', checkStored);
    };
  }, [onLoginSuccess, checkStored]);

  const handleGoogleLogin = () => {
    setIsAuthenticating(true);
    setAuthError(null);

    const width = 500;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      '/api/auth/google/url',
      'KeepsakeGoogleAuth',
      `width=${width},height=${height},top=${top},left=${left}`
    );

    // If popup was blocked by browser or on mobile WebView, fallback to direct redirect
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = '/api/auth/google/url';
      return;
    }

    // Monitor if popup closed without completing or completed via storage
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setTimeout(() => {
          checkStored();
          setIsAuthenticating(false);
        }, 500);
      }
    }, 500);
  };

  const handleDirectRedirect = () => {
    setIsAuthenticating(true);
    window.location.href = '/api/auth/google/url';
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-neutral-50 dark:bg-[#0c0c0e] text-neutral-900 dark:text-neutral-100 transition-colors select-none">
      {/* Top Navigation */}
      <header className="w-full px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-sm">
            <Bookmark className="w-5 h-5 fill-current" />
          </div>
          <span className="font-bold text-base tracking-tight text-neutral-900 dark:text-white">
            Keepsake
          </span>
        </div>

        {/* Theme Switcher Button */}
        <button
          onClick={onCycleTheme}
          title={`Theme: ${
            themeMode === 'system'
              ? `System (${effectiveTheme})`
              : themeMode === 'dark'
              ? 'Dark'
              : 'Light'
          }`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-medium transition-colors"
        >
          {themeMode === 'system' ? (
            <Monitor className="w-3.5 h-3.5" />
          ) : themeMode === 'dark' ? (
            <Moon className="w-3.5 h-3.5" />
          ) : (
            <Sun className="w-3.5 h-3.5" />
          )}
          <span className="capitalize">{themeMode}</span>
        </button>
      </header>

      {/* Main Login Card */}
      <main className="w-full flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-[#151518] rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-xl dark:shadow-2xl dark:shadow-black/50 p-8 sm:p-10 text-center flex flex-col items-center">
          {/* Brand Icon */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-sky-400 text-white flex items-center justify-center shadow-lg shadow-sky-500/25 mb-6">
            <Bookmark className="w-8 h-8 fill-current" />
          </div>

          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight mb-2">
            Welcome to Keepsake
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs mb-8 leading-relaxed">
            Your private, self-hosted sanctuary for web links, articles, and media.
          </p>

          {/* Feature highlights */}
          <div className="w-full bg-neutral-50 dark:bg-[#1b1b1f] rounded-2xl p-4 mb-8 text-left space-y-3 border border-neutral-100 dark:border-neutral-800/80 text-xs text-neutral-600 dark:text-neutral-300">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Self-hosted & private on your own server</span>
            </div>
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-sky-500 shrink-0" />
              <span>Distraction-free Reader Mode & rich scrapers</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Cloud className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Optional Google Drive multi-device backup</span>
            </div>
          </div>

          {/* Error Message if any */}
          {authError && (
            <div className="w-full mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isAuthenticating}
            className="w-full h-12 rounded-xl bg-white dark:bg-[#1e1e24] border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-[#25252c] text-neutral-800 dark:text-white font-semibold text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group"
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
                <span>Waiting for Google sign in...</span>
              </>
            ) : (
              <>
                {/* Official Google G Logo */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Alternative direct redirect link for WebViews / popup-blocked environments */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleDirectRedirect}
              className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            >
              Popups blocked? Click to sign in directly
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
        <div className="flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          <span>Protected with Google OAuth 2.0 &amp; self-hosted storage</span>
        </div>
      </footer>
    </div>
  );
};
