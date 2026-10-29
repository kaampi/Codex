// Builds a single-executable Core service: no Node.js install required on
// the target machine. Mirrors the "unsigned build, that's expected for now"
// stance kaampi Write's own desktop-build.yml already takes (roadmap-ideas.md
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

// Resolved and invoked as a plain Node script (not the npm-generated
// node_modules/.bin/postject[.cmd] shim): that shim is a batch file on
// Windows, and spawnSync/execFileSync cannot launch a .cmd directly
// (CreateProcess needs the command interpreter for that) - it fails with
// EINVAL there regardless of the path being correct. Resolving the
// package's own bin script and running it via `node <script>` sidesteps
// the whole shell-vs-no-shell question identically on every platform.
const postjectPackageJson = fileURLToPath(import.meta.resolve('postject/package.json'));
const postjectCli = join(dirname(postjectPackageJson), 'dist', 'cli.js');
if (!existsSync(postjectCli)) throw new Error(`postject's CLI script was not found at ${postjectCli} - run npm install at the repo root first.`);

execFileSync(process.execPath, [
  postjectCli, exe, 'NODE_SEA_BLOB', join(dist, 'sea-prep.blob'),
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  // Node's own SEA docs: macOS Mach-O binaries need the blob injected into
  // its own segment, or the result is a binary that looks built but
  // segfaults immediately on exec (found the hard way - the first macOS
  // CI run produced exactly that: a clean build, then "Segmentation
  // fault: 11" the instant the smoke test tried to run it).
  ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : [])
], { stdio: 'inherit' });

// Also macOS-only, also from Node's SEA docs: postject's injection
// invalidates whatever signature the copied node binary started with
// (copyFileSync above copied a validly-signed node executable; it isn't
// one anymore once its contents changed), and an invalidly-signed Mach-O
// binary is refused at the kernel level, not just by Gatekeeper - that's
// the segfault, not a Gatekeeper dialog. An ad-hoc signature (no Apple
// Developer ID, no cost) is enough to make it launchable; real signing
// can replace this step later if a Developer ID is ever budgeted for.
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--remove-signature', exe], { stdio: 'inherit' });
  execFileSync('codesign', ['--sign', '-', exe], { stdio: 'inherit' });
}

console.log(`Built ${exe}`);
