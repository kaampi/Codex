import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const names = { sandbox: 'kaampi Explore', storybook: 'kaampi Write', comic: 'kaampi Comic' };
const hash = secret => createHash('sha256').update(secret).digest();

/** Pending attempts deliberately live only in memory and expire across service restarts. */
export function createPairing(core, now = Date.now) {
  const attempts = new Map();
  const prune = () => { for (const [id, attempt] of attempts) if (attempt.expires <= now()) attempts.delete(id); };
  const find = id => { prune(); return attempts.get(id) ?? fail(404, 'Pairing expired or not found'); };
  return {
    begin(app) {
      prune();
      if (!Object.hasOwn(names, app)) fail(400, 'Unknown app');
      if (attempts.size >= 32) fail(429, 'Too many pairing attempts');
      const id = randomBytes(16).toString('hex'), secret = randomBytes(32).toString('hex');
      const expires = now() + 5 * 60_000;
      attempts.set(id, { app, proof: hash(secret), expires, state: 'pending' });
      return { id, secret, expiresAt: new Date(expires).toISOString(), appName: names[app] };
    },
    list() {
      prune();
      return [...attempts].filter(([, row]) => row.state === 'pending').map(([id, row]) => ({ id, app: row.app, appName: names[row.app], code: id.slice(-6).toUpperCase(), expiresAt: new Date(row.expires).toISOString() }));
    },
    decide(id, approved) {
      const row = find(id);
      if (row.state !== 'pending') fail(409, 'Pairing already decided');
      row.state = approved ? 'approved' : 'denied';
      core.recordAdminAction('pairing.' + row.state, id);
      return { state: row.state };
    },
    claim(id, secret) {
      const row = find(id);
      if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/.test(secret) || !timingSafeEqual(hash(secret), row.proof)) fail(401, 'Invalid pairing proof');
      if (row.state === 'pending') return { state: 'pending' };
      attempts.delete(id);
      if (row.state === 'denied') return { state: 'denied' };
      return { state: 'connected', token: core.provision(row.app) };
    }
  };
}
