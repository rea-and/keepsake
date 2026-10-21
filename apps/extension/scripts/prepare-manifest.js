import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const sharedPath = path.resolve(extensionRoot, '../../packages/shared/src/index.ts');

const target = process.argv[2] || 'chrome';
const outDir = path.resolve(extensionRoot, `dist/${target}`);
const manifestSrc = path.resolve(extensionRoot, `manifest.${target}.json`);
const manifestDest = path.join(outDir, 'manifest.json');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Copy manifest
fs.copyFileSync(manifestSrc, manifestDest);

// Fix popup.html location if nested in src/
const nestedPopup = path.join(outDir, 'src/popup.html');
const rootPopup = path.join(outDir, 'popup.html');
if (fs.existsSync(nestedPopup)) {
  fs.copyFileSync(nestedPopup, rootPopup);
  fs.rmSync(path.join(outDir, 'src'), { recursive: true, force: true });
}

// Copy icons if needed
const iconsSrc = path.resolve(extensionRoot, 'public/icons');
const iconsDest = path.join(outDir, 'icons');
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, iconsDest, { recursive: true });
}

// Bundle content script as standalone IIFE (no imports allowed in Chrome/Firefox content scripts)
esbuild.buildSync({
  entryPoints: [path.resolve(extensionRoot, 'src/content.ts')],
  bundle: true,
  format: 'iife',
  outfile: path.join(outDir, 'content.js'),
  alias: {
    '@keepsake/shared': sharedPath
  },
  minify: true,
  target: ['chrome90', 'firefox90']
});

// Bundle background script
esbuild.buildSync({
  entryPoints: [path.resolve(extensionRoot, 'src/background.ts')],
  bundle: true,
  format: target === 'firefox' ? 'iife' : 'esm',
  outfile: path.join(outDir, 'background.js'),
  alias: {
    '@keepsake/shared': sharedPath
  },
  minify: true,
  target: ['chrome90', 'firefox90']
});

console.log(`Prepared extension bundle for ${target} at ${outDir}`);
