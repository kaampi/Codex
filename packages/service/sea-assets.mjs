import { readFile } from 'node:fs/promises';

const ADMIN_ASSETS = new Set(['admin.html', 'admin.css', 'admin.js']);

/**
 * The admin page's static files. Ordinary `node server.mjs` (dev, tests,
 * the npm-dependency path) reads them straight off disk next to this
 * module. A packaged single-executable build has no "next to this
 * module" - the bundler folds every .mjs file into one blob - so sea.json
 * ships these three as SEA assets instead, retrieved by name at runtime.
 * Both paths return the same bytes; only where they come from differs.
 */
export async function readAdminAsset(name) {
  if (!ADMIN_ASSETS.has(name)) throw new Error(`Unknown admin asset: ${name}`);
  let sea;
  try { sea = await import('node:sea'); } catch { sea = null; }
  if (sea?.isSea?.()) return Buffer.from(sea.getAsset(name));
  return readFile(new URL(`./${name}`, import.meta.url));
}
