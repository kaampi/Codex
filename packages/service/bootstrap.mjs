import { writeFile } from 'node:fs/promises';

/**
 * First-run convenience: when a Core database has never been provisioned
 * (no app or admin credential exists yet), generate every credential the
 * StoryBook AI family needs and leave them in one local file next to the
 * database for a pairing desktop app to pick up automatically - no CLI,
 * no copy-pasting a 64-character key.
 *
 * The file's only protection is that it lives in a per-user location
 * (e.g. %LOCALAPPDATA%\StoryCore on Windows) that other OS accounts
 * cannot read by default; this is the same trust assumption most local
 * apps make for a per-user credential file, not a new one. A consuming
 * app must remove or null out its own claimed field after reading it so
 * the token is not handed out again by a later reader of the same file.
 */
export async function writeBootstrapIfFirstRun(core, path) {
  if (core.hasAnyCredentials()) return false;
  const credentials = {
    storybook: core.provision('storybook'),
    sandbox: core.provision('sandbox'),
    comic: core.provision('comic'),
    admin: core.provisionAdmin(),
    createdAt: new Date().toISOString()
  };
  // mode 0o600 matters on POSIX; on Windows it is largely a no-op (NTFS
  // ACLs, not POSIX bits, govern access there) and the per-user directory
  // the caller places this file in is what actually restricts access.
  await writeFile(path, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  return true;
}
