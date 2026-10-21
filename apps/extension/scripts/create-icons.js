import fs from 'fs';
import path from 'path';

// Minimal 1x1 transparent/blue PNG buffer
const BLUE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEeQHzc1p3vQAAAABJRU5ErkJggg==';
const buffer = Buffer.from(BLUE_PNG_BASE64, 'base64');

const iconsDir = path.resolve('public/icons');
fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-16.png'), buffer);
fs.writeFileSync(path.join(iconsDir, 'icon-48.png'), buffer);
fs.writeFileSync(path.join(iconsDir, 'icon-128.png'), buffer);
console.log('Icons generated successfully.');
