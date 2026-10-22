import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');

// Only bundle local output produced by Vite; do not fetch or embed remote code.
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
for (const [tag, src] of scripts) {
  const path = resolve(dist, src.replace(/^\//, ''));
  if (!path.startsWith(dist + '/')) throw new Error('Script outside dist/.');
  const code = (await readFile(path, 'utf8')).replace(/<\/script/gi, '<\\/script');
  // A replacement callback preserves literal $&, $` and $' in compiled code.
  // A replacement string would substitute the original HTML tag into the code.
  html = html.replace(tag, () => `<script type="module">${code}</script>`);
}

const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)];
for (const [tag, href] of styles) {
  const path = resolve(dist, href.replace(/^\//, ''));
  if (!path.startsWith(dist + '/')) throw new Error('Stylesheet outside dist/.');
  const css = (await readFile(path, 'utf8')).replace(/<\/style/gi, '<\\/style');
  html = html.replace(tag, () => `<style>${css}</style>`);
}

const icon = await readFile(resolve(root, 'public/favicon.svg'));
html = html.replace(/href="\/favicon\.svg"/g, () => `href="data:image/svg+xml;base64,${icon.toString('base64')}"`);
const target = resolve(dist, 'PHASE.html');
await writeFile(target, html);
console.log(`Portable application written to ${target}`);
