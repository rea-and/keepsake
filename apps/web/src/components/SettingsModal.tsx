import React, { useState, useRef } from 'react';
import { AuthSession, SyncStatus, Bookmark, Collection, exportToNetscapeHtml } from '@keepsake/shared';
import {
  X,
  Cloud,
  CloudOff,
  RefreshCw,
  Download,
  Upload,
  HardDrive,
  LogOut,
  CheckCircle2,
  AlertCircle,
  FileText,
  Server,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
  Check
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  authSession: AuthSession | null;
  onSetAuthSession: (session: AuthSession | null) => void;
  syncStatus: SyncStatus;
  onSync: () => void;
  bookmarks: Bookmark[];
  collections: Collection[];
  onImport: (content: string, format: 'html' | 'json') => { importedCount: number };
  themeMode: 'system' | 'light' | 'dark';
  effectiveTheme: 'light' | 'dark';
  onSelectThemeMode: (mode: 'system' | 'light' | 'dark') => void;
  cardSize?: 'small' | 'medium' | 'large';
  onSelectCardSize?: (size: 'small' | 'medium' | 'large') => void;
  isDriveSyncEnabled?: boolean;
  onToggleDriveSync?: (enabled: boolean) => void;
  onLogout?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  authSession,
  onSetAuthSession,
  syncStatus,
  onSync,
  bookmarks,
  collections,
  onImport,
  themeMode,
  effectiveTheme,
  onSelectThemeMode,
  cardSize = 'medium',
  onSelectCardSize,
  isDriveSyncEnabled = false,
  onToggleDriveSync,
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'sync' | 'backup' | 'about'>('appearance');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isDriveBackingUp, setIsDriveBackingUp] = useState(false);
  const [driveBackupSuccess, setDriveBackupSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = () => {
    // Open OAuth popup window
    const width = 500;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      '/api/auth/google/url',
      'KeepsakeGoogleAuth',
      `width=${width},height=${height},top=${top},left=${left}`
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'KEEPSAKE_AUTH_SUCCESS' && event.data.payload) {
        onSetAuthSession(event.data.payload);
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
  };

  const handleExportHtml = () => {
    const html = exportToNetscapeHtml(bookmarks, collections);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keepsake-bookmarks-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const data = {
      app: 'Keepsake',
      version: 1,
      exportedAt: new Date().toISOString(),
      collections,
      bookmarks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keepsake-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const isJson = file.name.endsWith('.json');
      try {
        const res = onImport(content, isJson ? 'json' : 'html');
        setImportStatus(`Successfully imported ${res.importedCount} bookmarks!`);
      } catch (err: any) {
        setImportStatus(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white dark:bg-[#151518] rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base text-neutral-900 dark:text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 border-b border-neutral-100 dark:border-neutral-800 flex gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'appearance'
                ? 'border-sky-500 text-sky-500'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            Appearance
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'sync'
                ? 'border-sky-500 text-sky-500'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            Google Drive Sync
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'backup'
                ? 'border-sky-500 text-sky-500'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            Import & Export
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'about'
                ? 'border-sky-500 text-sky-500'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            Server & Integrations
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {activeTab === 'appearance' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                  Theme & Visual Style
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Choose your interface appearance. By default, Keepsake is system-driven and automatically adapts to your operating system's light or dark mode.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* System Driven */}
                <button
                  type="button"
                  onClick={() => onSelectThemeMode('system')}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                    themeMode === 'system'
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 ring-2 ring-sky-500/20'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1a1a1e] hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                        Default
                      </span>
                    </div>
                    <div className="font-semibold text-xs text-neutral-900 dark:text-white">
                      System
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
                      Matches your device preference ({effectiveTheme})
                    </div>
                  </div>

                  {themeMode === 'system' && (
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </div>
                  )}
                </button>

                {/* Light */}
                <button
                  type="button"
                  onClick={() => onSelectThemeMode('light')}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                    themeMode === 'light'
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 ring-2 ring-sky-500/20'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1a1a1e] hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-500">
                        <Sun className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="font-semibold text-xs text-neutral-900 dark:text-white">
                      Light
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
                      Crisp, bright look with soft gray surfaces
                    </div>
                  </div>

                  {themeMode === 'light' && (
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </div>
                  )}
                </button>

                {/* Dark */}
                <button
                  type="button"
                  onClick={() => onSelectThemeMode('dark')}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                    themeMode === 'dark'
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 ring-2 ring-sky-500/20'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1a1a1e] hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-300">
                        <Moon className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="font-semibold text-xs text-neutral-900 dark:text-white">
                      Dark
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
                      Deep black/dark grey styling, comfortable for your eyes
                    </div>
                  </div>

                  {themeMode === 'dark' && (
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </div>
                  )}
                </button>
              </div>

              {/* Grid View Bookmark Box Size (3 levels) */}
              <div className="pt-5 border-t border-neutral-100 dark:border-neutral-800">
                <div>
                  <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                    Grid View Card Size
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Choose the size of bookmark boxes in the cards view grid. Medium is the standard default size.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  {/* Small (Compact) */}
                  <button
                    type="button"
                    onClick={() => onSelectCardSize?.('small')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                      cardSize === 'small'
                        ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 ring-2 ring-sky-500/20'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1a1a1e] hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-neutral-900 dark:text-white">Compact (Small)</span>
                        {cardSize === 'small' && <Check className="w-4 h-4 text-sky-500" />}
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                        Denser grid with compact preview thumbnails and minimal padding.
                      </p>
                    </div>
                  </button>

                  {/* Medium (Standard Current) */}
                  <button
                    type="button"
                    onClick={() => onSelectCardSize?.('medium')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                      cardSize === 'medium'
                        ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 ring-2 ring-sky-500/20'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1a1a1e] hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-neutral-900 dark:text-white">Medium</span>
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                            Current
                          </span>
                        </div>
                        {cardSize === 'medium' && <Check className="w-4 h-4 text-sky-500" />}
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                        Standard balanced dimensions for comfortable browsing and reading.
                      </p>
                    </div>
                  </button>

                  {/* Large (Spacious) */}
                  <button
                    type="button"
                    onClick={() => onSelectCardSize?.('large')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                      cardSize === 'large'
                        ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/20 ring-2 ring-sky-500/20'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1a1a1e] hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-neutral-900 dark:text-white">Spacious (Large)</span>
                        {cardSize === 'large' && <Check className="w-4 h-4 text-sky-500" />}
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                        Large prominent cover art and expanded multi-line excerpt text.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-5">
              {/* Logged in User Profile Banner */}
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#1a1a1e] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {authSession?.user?.picture ? (
                    <img
                      src={authSession.user.picture}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 font-bold flex items-center justify-center shrink-0">
                      {authSession?.user?.name ? authSession.user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                        {authSession ? authSession.user.name : 'Not Signed In'}
                      </h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                        Active Account
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {authSession?.user?.email || 'Logged in with Google'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onLogout?.();
                    onClose();
                  }}
                  title="Sign Out of Keepsake"
                  className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-rose-300 dark:hover:border-rose-900 text-neutral-600 dark:text-neutral-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>

              {/* Optional Google Drive Sync Toggle */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#161619] space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-sky-500" />
                      <h4 className="font-semibold text-sm text-neutral-900 dark:text-white">
                        Google Drive Sync (Optional)
                      </h4>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                      Enable automated background sync to your personal Google Drive AppData folder to keep your bookmarks backed up and synchronized across devices.
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDriveSyncEnabled}
                    onClick={() => onToggleDriveSync?.(!isDriveSyncEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isDriveSyncEnabled ? 'bg-sky-500' : 'bg-neutral-300 dark:bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        isDriveSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {isDriveSyncEnabled ? (
                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                      <span>Status: <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">Enabled (Syncing with Drive)</strong></span>
                      <span>
                        {syncStatus.lastSyncedAt
                          ? `Last sync: ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}`
                          : 'Pending first sync'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#1a1a1e] border border-neutral-200 dark:border-neutral-800">
                      <div>
                        <div className="font-medium text-xs text-neutral-800 dark:text-neutral-200">
                          Synchronize Now
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Bidirectional sync with Google Drive cloud storage
                        </div>
                      </div>
                      <button
                        onClick={onSync}
                        disabled={syncStatus.isSyncing}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-60"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`}
                        />
                        <span>{syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                      </button>
                    </div>

                    {syncStatus.error && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{syncStatus.error}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                    <span>Sync is currently turned off. All bookmarks stay on your local server.</span>
                    <button
                      type="button"
                      onClick={() => onToggleDriveSync?.(true)}
                      className="px-3 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold transition-colors shrink-0"
                    >
                      Turn On
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-5">
              {/* Import Section */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-neutral-800 dark:text-neutral-200">
                  <Upload className="w-4 h-4 text-sky-500" />
                  <span>Import Bookmarks</span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Import bookmarks from Google Chrome, Firefox, Safari, Raindrop.io, or Pocket
                  HTML export file.
                </p>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".html,.htm,.json"
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center gap-2 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>Choose HTML or JSON File</span>
                </button>

                {importStatus && (
                  <div className="text-xs text-emerald-500 font-medium">{importStatus}</div>
                )}
              </div>

              {/* Export Section */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-neutral-800 dark:text-neutral-200">
                  <Download className="w-4 h-4 text-emerald-500" />
                  <span>Export Bookmarks</span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Download a full backup of your collections and bookmarks.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportHtml}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors"
                  >
                    Export Netscape HTML
                  </button>
                  <button
                    onClick={handleExportJson}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors"
                  >
                    Export JSON Backup
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#1a1a1e] border border-neutral-200 dark:border-neutral-800 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-white">
                  <Server className="w-4 h-4 text-sky-500" />
                  <span>Keepsake Architecture</span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Keepsake is an open, self-hosted, Google Drive-synchronized Raindrop.io clone.
                  Your bookmarks and collections are stored privately in your own Google Drive
                  account using CRDT conflict resolution.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-2 text-xs">
                <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Clients & Extensions:
                </div>
                <ul className="list-disc pl-4 space-y-1 text-neutral-500 dark:text-neutral-400">
                  <li>Web Application (Deployed on Ubuntu server via Docker)</li>
                  <li>Android Client (Browse + Android System Share Sheet link ingestion)</li>
                  <li>Chrome Browser Extension (Manifest V3 popup & context menus)</li>
                  <li>Firefox Browser Extension (Compatible WebExtension)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
