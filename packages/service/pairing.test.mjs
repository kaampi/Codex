import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCore, createCoreServer } from './core.mjs';
import { createPairing } from './pairing.mjs';

test('pairing requires approval, private proof, expiry and single-use claim', () => {
  let now = 0, issued = 0;
  const pairing = createPairing({ provision: app => { issued++; return app; }, recordAdminAction() {} }, () => now);
  const attempt = pairing.begin('sandbox');
  assert.equal(issued, 0);
  assert.equal(pairing.claim(attempt.id, attempt.secret).state, 'pending');
  assert.equal(JSON.stringify(pairing.list()).includes(attempt.secret), false);
  assert.throws(() => pairing.claim(attempt.id, '0'.repeat(64)));
  pairing.decide(attempt.id, true);
  assert.equal(issued, 0);
  assert.equal(pairing.claim(attempt.id, attempt.secret).token, 'sandbox');
  assert.equal(issued, 1);
  assert.throws(() => pairing.claim(attempt.id, attempt.secret));
  const denied = pairing.begin('comic'); pairing.decide(denied.id, false);
  assert.equal(pairing.claim(denied.id, denied.secret).state, 'denied');
  assert.equal(issued, 1);
  const expired = pairing.begin('storybook'); now += 300001;
  assert.throws(() => pairing.decide(expired.id, true));
  assert.throws(() => pairing.begin('admin'));
});

test('only the administrator can approve and browser-origin requests cannot initiate pairing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaampi-pair-'));
  const core = openCore(join(dir, 'core.db'));
  const admin = core.provisionAdmin(), app = core.provision('sandbox');
  const server = createCoreServer(core);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers={}) => fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  try {
    assert.equal((await post('/v1/pairing',{app:'sandbox'},{origin:'https://example.com'})).status,403);
    const attempt = await (await post('/v1/pairing',{app:'sandbox'})).json();
    assert.equal((await post('/admin/api/pairing',{id:attempt.id,approved:true},{authorization:`Bearer ${app}`})).status,401);
    assert.equal((await post('/admin/api/pairing',{id:attempt.id,approved:true},{authorization:`Bearer ${admin}`})).status,200);
    const claimed = await (await post(`/v1/pairing/${attempt.id}/claim`,{secret:attempt.secret})).json();
    assert.equal(claimed.state,'connected');
    assert.equal(core.authenticate(claimed.token),'sandbox');
    assert.equal((await post(`/v1/pairing/${attempt.id}/claim`,{secret:attempt.secret})).status,404);
  } finally { await new Promise(resolve=>server.close(resolve));core.close();rmSync(dir,{recursive:true,force:true}); }
});
