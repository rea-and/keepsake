import fs from 'fs';
import path from 'path';

const target = process.argv[2] || 'chrome';
const outDir = path.resolve(`dist/${target}`);
const manifestSrc = path.resolve(`manifest.${target}.json`);
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
const iconsSrc = path.resolve('public/icons');
const iconsDest = path.join(outDir, 'icons');
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, iconsDest, { recursive: true });
}

console.log(`Prepared extension bundle for ${target} at ${outDir}`);
