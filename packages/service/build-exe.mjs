// Builds a single-executable Core service: no Node.js install required on
// the target machine. Mirrors the "unsigned build, that's expected for now"
// stance StoryBook AI's own desktop-build.yml already takes (roadmap-ideas.md
// #35) - no code-signing here either, same reason (no budget for it yet).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const bundleOnly = process.argv.includes('--bundle-only');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(here, 'server.mjs')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: join(dist, 'core-service.cjs'),
  // node: built-ins (incl. node:sqlite, node:sea) stay external - esbuild
  // leaves any "node:"-prefixed import alone under platform:'node' already,
  // this is just explicit about it. Everything else (zod, the schema
  // package, bootstrap.mjs, sea-assets.mjs, ...) gets folded in: the whole
  // point is one file, nothing to resolve relative to at runtime.
  external: ['node:*'],
  logLevel: 'info'
});

if (bundleOnly) {
  console.log('Bundled only (--bundle-only): dist/core-service.cjs. No .exe produced.');
  process.exit(0);
}

const exe = join(dist, process.platform === 'win32' ? 'storycore-service.exe' : 'storycore-service');
copyFileSync(process.execPath, exe);
if (process.platform !== 'win32') chmodSync(exe, 0o755);

execFileSync(process.execPath, ['--experimental-sea-config', join(here, 'sea-config.json')], { cwd: here, stdio: 'inherit' });

const postjectName = process.platform === 'win32' ? 'postject.cmd' : 'postject';
const postjectBin = [join(here, 'node_modules', '.bin', postjectName), join(here, '..', '..', 'node_modules', '.bin', postjectName)]
  .find(existsSync);
if (!postjectBin) throw new Error('postject is not installed - run npm install at the repo root first.');

execFileSync(postjectBin, [
  exe, 'NODE_SEA_BLOB', join(dist, 'sea-prep.blob'),
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
], { stdio: 'inherit' });

console.log(`Built ${exe}`);
