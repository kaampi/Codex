import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openCore } from './core.mjs';
import { writeBootstrapIfFirstRun } from './bootstrap.mjs';

test('a fresh database auto-provisions every credential exactly once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'core-bootstrap-'));
  const dbPath = join(root, 'core.db'), bootstrapPath = join(root, 'bootstrap.json');
  const core = openCore(dbPath);
  try {
    assert.equal(core.hasAnyCredentials(), false);
    const wrote = await writeBootstrapIfFirstRun(core, bootstrapPath);
    assert.equal(wrote, true);
    assert.equal(core.hasAnyCredentials(), true);

    const credentials = JSON.parse(await readFile(bootstrapPath, 'utf8'));
    for (const key of ['storybook', 'sandbox', 'comic', 'admin']) {
      assert.match(credentials[key], /^[0-9a-f]{64}$/, key);
    }
    assert.equal(core.authenticate(credentials.storybook), 'storybook');
    assert.equal(core.authenticate(credentials.sandbox), 'sandbox');
    assert.equal(core.authenticate(credentials.comic), 'comic');
    assert.doesNotThrow(() => core.authenticateAdmin(credentials.admin));

    const mode = (await stat(bootstrapPath)).mode & 0o777;
    if (process.platform !== 'win32') assert.equal(mode, 0o600);

    // A database that already has credentials (even just one, from a
    // manual `provision` call) must never be auto-provisioned again -
    // that would silently mint a second valid token nobody asked for.
    const secondRun = await writeBootstrapIfFirstRun(core, bootstrapPath);
    assert.equal(secondRun, false);
  } finally { core.close(); await rm(root, { recursive: true, force: true }); }
});

test('an already-provisioned database is never auto-provisioned', async () => {
  const root = await mkdtemp(join(tmpdir(), 'core-bootstrap-existing-'));
  const dbPath = join(root, 'core.db'), bootstrapPath = join(root, 'bootstrap.json');
  const core = openCore(dbPath);
  try {
    core.provision('storybook');
    const wrote = await writeBootstrapIfFirstRun(core, bootstrapPath);
    assert.equal(wrote, false);
    await assert.rejects(readFile(bootstrapPath), { code: 'ENOENT' });
  } finally { core.close(); await rm(root, { recursive: true, force: true }); }
});

test('server.mjs writes the bootstrap file on its very first start', async () => {
  const root = await mkdtemp(join(tmpdir(), 'core-bootstrap-cli-'));
  const dbPath = join(root, 'core.db');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    env: { ...process.env, CORE_DB_PATH: dbPath, CORE_PORT: '43177' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const onData = () => { if (/First run: wrote pairing credentials/.test(output)) { child.stdout.off('data', onData); resolve(); } };
      child.stdout.on('data', onData);
      child.once('exit', code => reject(new Error(`server exited early with code ${code}`)));
      setTimeout(() => reject(new Error('timed out waiting for first-run message')), 10_000);
    });
    const credentials = JSON.parse(await readFile(dbPath + '.bootstrap.json', 'utf8'));
    assert.match(credentials.storybook, /^[0-9a-f]{64}$/);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
