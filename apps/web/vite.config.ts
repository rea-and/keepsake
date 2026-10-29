import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'keepsake-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((name) => name.startsWith('assets/') && /\.(js|css)$/.test(name)).map((name) => `/${name}`);
      const precache = ['/index.html', ...assets].sort();
      const html = bundle['index.html'];
      const htmlSource = html?.type === 'asset' ? String(html.source) : '';
      const version = createHash('sha256').update(JSON.stringify(precache)).update(htmlSource).digest('hex').slice(0, 16);
      const source = readFileSync(path.resolve(__dirname, 'service-worker.js'), 'utf8')
        .replace('__CACHE_NAME__', JSON.stringify(`keepsake-shell-${version}`))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source });
    }
  }],
  resolve: {
    alias: {
      '@keepsake/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
