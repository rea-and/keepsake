import React, { useState } from 'react';
import { Bookmark } from '@keepsake/shared';
import { X, ExternalLink, Type, Clock, BookOpen } from 'lucide-react';

interface ReaderModalProps {
  bookmark: Bookmark | null;
  onClose: () => void;
}

export const ReaderModal: React.FC<ReaderModalProps> = ({ bookmark, onClose }) => {
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [readingTheme, setReadingTheme] = useState<'light' | 'sepia' | 'dark'>('light');

  if (!bookmark || !bookmark.readerContent) return null;

  const { title, byline, content, length, siteName } = bookmark.readerContent;
  const wordCount = length || 800;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  const fontClasses = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono'
  }[fontFamily];

  const sizeClasses = {
    sm: 'text-sm leading-relaxed',
    md: 'text-base leading-relaxed',
    lg: 'text-lg leading-loose',
    xl: 'text-xl leading-loose'
  }[fontSize];

  const themeClasses = {
    light: 'bg-white text-slate-800',
    sepia: 'bg-[#fbf0d9] text-[#5f4b32]',
    dark: 'bg-[#18181b] text-zinc-100'
  }[readingTheme];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-3xl h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-700/50 ${themeClasses}`}
      >
        {/* Reader Top Controls Toolbar */}
        <div className="px-6 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 opacity-60" />
            <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
              Reader Mode
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Reading Theme */}
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setReadingTheme('light')}
                className={`px-2 py-1 rounded ${readingTheme === 'light' ? 'bg-white text-black shadow-sm' : 'opacity-60'}`}
              >
                Light
              </button>
              <button
                onClick={() => setReadingTheme('sepia')}
                className={`px-2 py-1 rounded ${readingTheme === 'sepia' ? 'bg-[#fbf0d9] text-[#5f4b32] shadow-sm font-semibold' : 'opacity-60'}`}
              >
                Sepia
              </button>
              <button
                onClick={() => setReadingTheme('dark')}
                className={`px-2 py-1 rounded ${readingTheme === 'dark' ? 'bg-zinc-800 text-white shadow-sm' : 'opacity-60'}`}
              >
                Dark
              </button>
            </div>

            {/* Font Family */}
            <div className="hidden sm:flex items-center gap-1 bg-black/5 dark:bg-white/10 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setFontFamily('sans')}
                className={`px-2 py-1 rounded font-sans ${fontFamily === 'sans' ? 'bg-white dark:bg-zinc-800 shadow-sm font-semibold' : 'opacity-60'}`}
              >
                Sans
              </button>
              <button
                onClick={() => setFontFamily('serif')}
                className={`px-2 py-1 rounded font-serif ${fontFamily === 'serif' ? 'bg-white dark:bg-zinc-800 shadow-sm font-semibold' : 'opacity-60'}`}
              >
                Serif
              </button>
              <button
                onClick={() => setFontFamily('mono')}
                className={`px-2 py-1 rounded font-mono ${fontFamily === 'mono' ? 'bg-white dark:bg-zinc-800 shadow-sm font-semibold' : 'opacity-60'}`}
              >
                Mono
              </button>
            </div>

            {/* Font Size */}
            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setFontSize('sm')}
                className={`px-1.5 py-1 rounded text-xs ${fontSize === 'sm' ? 'bg-white dark:bg-zinc-800 shadow-sm font-bold' : 'opacity-60'}`}
              >
                A-
              </button>
              <button
                onClick={() => setFontSize('md')}
                className={`px-1.5 py-1 rounded text-sm ${fontSize === 'md' ? 'bg-white dark:bg-zinc-800 shadow-sm font-bold' : 'opacity-60'}`}
              >
                A
              </button>
              <button
                onClick={() => setFontSize('lg')}
                className={`px-1.5 py-1 rounded text-base ${fontSize === 'lg' ? 'bg-white dark:bg-zinc-800 shadow-sm font-bold' : 'opacity-60'}`}
              >
                A+
              </button>
            </div>

            {/* Original Link */}
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Original Website"
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Article Scroll Body */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-12 py-8">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Metadata Header */}
            <div>
              <div className="flex items-center gap-2 text-xs opacity-60 mb-2">
                <span>{siteName || bookmark.domain}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {readingTime} min read
                </span>
                {byline && (
                  <>
                    <span>•</span>
                    <span>By {byline}</span>
                  </>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mb-4">
                {title || bookmark.title}
              </h1>
            </div>

            {/* Sanitized Article HTML Content */}
            <div
              className={`reader-content ${fontClasses} ${sizeClasses}`}
              dangerouslySetInnerHTML={{ __html: content || '' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
