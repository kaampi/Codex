import { openCore, createCoreServer } from './core.mjs';
import { backupEncryption, createBackup, restoreBackup } from './backup.mjs';
import { createAdminBackup } from './admin.mjs';
import { drillBackup } from './drill.mjs';
import { writeBootstrapIfFirstRun } from './bootstrap.mjs';
import { createInterface } from 'node:readline/promises';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

// An installed Core should need zero configuration: CORE_DB_PATH stays a
// supported override (every test and every dev workflow already sets it
// explicitly), but an installer's Startup shortcut should not need to
// carry environment variables just to pick a sensible, per-user location.
function defaultDbPath() {
  const base = process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'StoryCore')
    : join(homedir(), '.storycore');
  return join(base, 'core.db');
}

const recoveryPhrase = async () => {
  if (process.stdin.isTTY) throw new Error('Supply recovery phrase via stdin from a secure prompt, never a command argument');
  const lines = createInterface({ input: process.stdin });
  try { const phrase = await new Promise((resolve, reject) => {
    lines.once('line', resolve);
    lines.once('close', () => reject(new Error('Missing recovery phrase')));
  }); return phrase; } finally { lines.close(); }
};

// Wrapped in an async function, not top-level await: esbuild's CJS output
// (needed for Node's single-executable-application packaging, which only
// accepts a CommonJS main script) cannot contain top-level await. Plain
// `node server.mjs` runs identically either way - this just changes where
// the awaiting happens, not the order of operations or error behavior (an
// unhandled rejection here still crashes the process with a nonzero exit,
// same as an uncaught top-level await would).
async function main() {
const command = process.argv[2];
if (command === 'drill') {
  const archive = process.argv[3];
  if (!archive) throw new Error('Usage: drill <archive>');
  const mode = await backupEncryption(archive);
  process.stdout.write(JSON.stringify(await drillBackup(archive, mode === 'encrypted' ? await recoveryPhrase() : undefined)) + '\n');
} else if (command === 'restore') {
  const [archive, destination] = process.argv.slice(3);
  if (!archive || !destination) throw new Error('Usage: restore <archive> <new-directory>');
  const mode = await backupEncryption(archive);
  process.stdout.write(JSON.stringify(await restoreBackup(archive, destination, mode === 'encrypted' ? await recoveryPhrase() : undefined)) + '\n');
} else {
const file = process.env.CORE_DB_PATH ?? defaultDbPath();
await mkdir(dirname(file), { recursive: true });
const core = openCore(file);
if (command === 'provision') {
  const token = core.provision(process.argv[3]);
  process.stdout.write(`${token}\n`);
  core.close();
} else if (command === 'provision-admin') {
  process.stdout.write(`${core.provisionAdmin()}\n`);
  core.close();
} else if (command === 'backup' || command === 'backup-schedule') {
  if (!process.env.CORE_BACKUP_DIR) throw new Error('Set CORE_BACKUP_DIR');
  const setting = process.env.CORE_BACKUP_ENCRYPTION ?? 'on';
  if (setting !== 'on' && setting !== 'off') throw new Error('CORE_BACKUP_ENCRYPTION must be on or off');
  const encrypted = setting === 'on';
  const passphrase = encrypted ? await recoveryPhrase() : undefined;
  const backup = () => createBackup(core, {
      mediaDir: process.env.CORE_MEDIA_DIR ?? file + '.media',
      backupDir: process.env.CORE_BACKUP_DIR,
      passphrase,
      encrypted,
      keep: Number(process.env.CORE_BACKUP_KEEP ?? 10)
    });
  if (command === 'backup') {
    try { process.stdout.write(JSON.stringify(await backup()) + '\n'); }
    finally { core.close(); }
  } else {
    const hours = Number(process.env.CORE_BACKUP_INTERVAL_HOURS ?? 24);
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) throw new Error('Interval must be 1–168 hours');
    let stopped = false, running = false, timer;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      if (!running) core.close();
    };
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
    const loop = async () => {
      if (stopped) return;
      running = true;
      try { process.stdout.write(JSON.stringify({ event: 'backup', ...await backup() }) + '\n'); }
      catch (error) { process.stderr.write(JSON.stringify({ event: 'backup-error', message: error.message }) + '\n'); }
      finally { running = false; }
      if (stopped) core.close();
      else timer = setTimeout(loop, hours * 60 * 60 * 1000);
    };
    await loop();
  }
} else if (!command) {
  const port = Number(process.env.CORE_PORT ?? 43127);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CORE_PORT');
  const mediaDir = process.env.CORE_MEDIA_DIR ?? file + '.media';
  const bootstrapPath = process.env.CORE_BOOTSTRAP_PATH ?? file + '.bootstrap.json';
  const firstRun = await writeBootstrapIfFirstRun(core, bootstrapPath);
  if (firstRun) process.stdout.write(`First run: wrote pairing credentials to ${bootstrapPath}\n`);
  const adminBackup = createAdminBackup(core, mediaDir);
  const server = createCoreServer(core, { mediaDir, adminBackup });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Core listening on 127.0.0.1:${port}\n`));
  const shutdown = () => server.close(async () => { await adminBackup.stop(); core.close(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  core.close();
  throw new Error('Usage: node server.mjs [provision <app>|provision-admin|backup|backup-schedule|drill <archive>|restore <archive> <new-directory>]');
}
}
}

main();
