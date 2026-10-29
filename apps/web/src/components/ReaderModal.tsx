import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useDialog } from './useDialog';
import { Bookmark } from '@keepsake/shared';
import { X, ExternalLink, Type, Clock, BookOpen } from 'lucide-react';

interface ReaderModalProps {
  bookmark: Bookmark | null;
  onClose: () => void;
}

function sanitizeReaderHtml(html: string): string {
  if (!html) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove dangerous executable or layout breaking tags
    const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'base', 'form', 'input', 'button', 'link', 'meta'];
    dangerousTags.forEach((tag) => {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    });

    // Strip on* event handlers and javascript: URIs from all remaining elements
    doc.querySelectorAll('*').forEach((el) => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();

        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }

        if (name === 'href' || name === 'src' || name === 'action') {
          if (val.startsWith('javascript:') || val.startsWith('vbscript:') || (val.startsWith('data:') && !val.startsWith('data:image/'))) {
            el.removeAttribute(attr.name);
          }
        }
      }
    });

    return doc.body.innerHTML;
  } catch {
    return '';
  }
}

export const ReaderModal: React.FC<ReaderModalProps> = ({ bookmark, onClose }) => {
  const dialogRef = useDialog(Boolean(bookmark?.readerContent), onClose);
  const scrollRef = useRef<HTMLDivElement>(null);
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(0);
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>(() => {
    const value = localStorage.getItem('keepsake_reader_size');
    return value === 'sm' || value === 'lg' || value === 'xl' ? value : 'md';
  });
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>(() => {
    const value = localStorage.getItem('keepsake_reader_font');
    return value === 'serif' || value === 'mono' ? value : 'sans';
  });
  const [readingTheme, setReadingTheme] = useState<'light' | 'sepia' | 'dark'>(() => {
    const value = localStorage.getItem('keepsake_reader_theme');
    return value === 'sepia' || value === 'dark' ? value : 'light';
  });
  const [readingWidth, setReadingWidth] = useState<'narrow' | 'normal' | 'wide'>(() => {
    const value = localStorage.getItem('keepsake_reader_width');
    return value === 'narrow' || value === 'wide' ? value : 'normal';
  });
  const [lineSpacing, setLineSpacing] = useState<'compact' | 'normal' | 'relaxed'>(() => {
    const value = localStorage.getItem('keepsake_reader_spacing');
    return value === 'compact' || value === 'relaxed' ? value : 'normal';
  });
  useEffect(() => { localStorage.setItem('keepsake_reader_size', fontSize); }, [fontSize]);
  useEffect(() => { localStorage.setItem('keepsake_reader_font', fontFamily); }, [fontFamily]);
  useEffect(() => { localStorage.setItem('keepsake_reader_theme', readingTheme); }, [readingTheme]);
  useEffect(() => { localStorage.setItem('keepsake_reader_width', readingWidth); }, [readingWidth]);
  useEffect(() => { localStorage.setItem('keepsake_reader_spacing', lineSpacing); }, [lineSpacing]);
  useLayoutEffect(() => {
    if (!bookmark?.readerContent || !scrollRef.current) return;
    const position = Number(localStorage.getItem(`keepsake_reader_position_${bookmark.id}`));
    scrollRef.current.scrollTop = Number.isFinite(position) && position > 0 ? position : 0;
    const el = scrollRef.current;
    setProgress(el.scrollHeight > el.clientHeight ? Math.round(el.scrollTop / (el.scrollHeight - el.clientHeight) * 100) : 0);
    return () => {
      if (positionTimer.current) clearTimeout(positionTimer.current);
      try { localStorage.setItem(`keepsake_reader_position_${bookmark.id}`, String(el.scrollTop)); } catch {}
    };
  }, [bookmark?.id, Boolean(bookmark?.readerContent)]);

  if (!bookmark || !bookmark.readerContent) return null;

  const { title, byline, content, textContent, siteName } = bookmark.readerContent;
  const plainText = textContent || (content ? new DOMParser().parseFromString(content, 'text/html').body.textContent || '' : '');
  const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  const fontClasses = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono'
  }[fontFamily];

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  }[fontSize];

  const themeClasses = {
    light: 'bg-white text-slate-800',
    sepia: 'bg-[#fbf0d9] text-[#5f4b32]',
    dark: 'bg-[#18181b] text-zinc-100'
  }[readingTheme];

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Reader" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
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
              <button onClick={() => setFontSize('xl')} className={`px-1.5 py-1 rounded text-lg ${fontSize === 'xl' ? 'bg-white dark:bg-zinc-800 shadow-sm font-bold' : 'opacity-60'}`} aria-label="Extra large text">A++</button>
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
              aria-label="Close reader"
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-2 border-b border-black/10 text-xs">
          <label className="sm:hidden">Font <select aria-label="Reading font" value={fontFamily} onChange={(e) => setFontFamily(e.target.value as typeof fontFamily)} className="ml-1 bg-transparent"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
          <label>Width <select aria-label="Reading width" value={readingWidth} onChange={(e) => setReadingWidth(e.target.value as typeof readingWidth)} className="ml-1 bg-transparent"><option value="narrow">Narrow</option><option value="normal">Normal</option><option value="wide">Wide</option></select></label>
          <label>Spacing <select aria-label="Line spacing" value={lineSpacing} onChange={(e) => setLineSpacing(e.target.value as typeof lineSpacing)} className="ml-1 bg-transparent"><option value="compact">Compact</option><option value="normal">Normal</option><option value="relaxed">Relaxed</option></select></label>
          <span className="ml-auto opacity-60" aria-label={`Reading progress ${progress} percent`}>{progress}%</span>
        </div>

        {/* Article Scroll Body */}
        <div ref={scrollRef} onScroll={(event) => {
          const el = event.currentTarget;
          const max = el.scrollHeight - el.clientHeight;
          setProgress(max > 0 ? Math.round(el.scrollTop / max * 100) : 0);
          if (positionTimer.current) clearTimeout(positionTimer.current);
          const position = el.scrollTop;
          positionTimer.current = setTimeout(() => { try { localStorage.setItem(`keepsake_reader_position_${bookmark.id}`, String(position)); } catch {} }, 250);
        }} className="flex-1 overflow-y-auto px-6 sm:px-12 py-8">
          <div className={`${readingWidth === 'narrow' ? 'max-w-md' : readingWidth === 'wide' ? 'max-w-none' : 'max-w-2xl'} mx-auto space-y-6`}>
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
              className={`reader-content ${fontClasses} ${sizeClasses} ${lineSpacing === 'compact' ? 'leading-normal' : lineSpacing === 'relaxed' ? 'leading-loose' : 'leading-relaxed'}`}
              dangerouslySetInnerHTML={{ __html: sanitizeReaderHtml(content || '') }}
            />
            {!content && textContent && <p className={`${fontClasses} ${sizeClasses} whitespace-pre-wrap`}>{textContent}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
