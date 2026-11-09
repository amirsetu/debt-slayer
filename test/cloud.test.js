// Cloud backup: the board is locked on the device, and every device ends up with the same board.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { TODAY, settings, board, ITEMS } from './fixtures/demo.js';

const KEY = 'test-app-key-0123456789', PASS = 'correct horse battery staple';

// a stand-in for the sync service's backup endpoints, with the same conflict rule
function fakeSync() {
  const backups = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const meta = b => ({ id: b.id, created_at: b.created_at, device: b.device, label: b.label, size: b.blob.length });
  async function fetch(url, init = {}) {
    const u = new URL(url), method = init.method || 'GET', latest = backups[backups.length - 1];
    if ((init.headers || {}).Authorization !== 'Bearer ' + KEY) return json(401, { error: 'unauthorized' });
    if (u.pathname === '/v1/backup' && method === 'PUT') {
      const body = JSON.parse(init.body);
      if (latest && !body.force && latest.id !== body.base && latest.device !== body.device) return json(409, { error: 'conflict', latest: meta(latest) });
      const b = { id: 'b' + (backups.length + 1), created_at: new Date().toISOString(), device: body.device, label: body.label, blob: body.blob };
      backups.push(b);
      return json(200, meta(b));
    }
    if (u.pathname === '/v1/backup' && method === 'GET') {
      const b = u.searchParams.get('id') ? backups.find(x => x.id === u.searchParams.get('id')) : latest;
      if (!b) return json(404, { error: 'no backup yet' });
      return json(200, u.searchParams.get('meta') ? meta(b) : Object.assign(meta(b), { blob: b.blob }));
    }
    return json(404, { error: 'not found' });
  }
  return { fetch, backups };
}

// a board that has synced before: live settings, sync times and statuses already there
const liveSettings = () => settings({ live: { url: 'https://sync.test', since: TODAY, lastAt: 1, status: { qonto: { ok: true } } }, acctSync: { qonto: { d: TODAY, at: 1, live: true } } });
async function device(server, docs) {
  return load({ today: TODAY, board: docs || {}, storage: { 'debtslayer.liveKey': KEY }, fetch: server.fetch });
}
async function turnOn(app, kc) {
  app.localStorage.setItem('debtslayer.cloud', JSON.stringify(Object.assign({}, kc, { last: null })));
}
const rentOf = app => app.state().ITEMS.find(i => i.id === 'rent').amt;

test('the board is locked: no readable data leaves the device, and only the passphrase opens it', async () => {
  const app = await load({ today: TODAY, board: board({ items: ITEMS }) });
  const kc = await app.cloud.newLockKey(PASS);
  const blob = await app.cloud.seal({ docs: app.cloud.store().dump() }, kc);
  for (const word of ['Rent', 'Claude', 'Resend', '900']) assert.ok(!blob.includes(word), `"${word}" is not readable in the backup`);
  const e = JSON.parse(blob);
  assert.deepEqual([e.v, e.alg, e.z, e.kdf.iter], [1, 'AES-GCM', 'gzip', 600000]);

  const other = await app.cloud.keyForEnvelope(PASS, blob); // the same passphrase on another device
  assert.equal((await app.cloud.unseal(blob, other)).docs['items/rent'].name, 'Rent');

  await assert.rejects(app.cloud.unseal(blob, await app.cloud.keyForEnvelope('wrong horse battery staple', blob)), /doesn't open/);
  const tampered = JSON.stringify(Object.assign({}, e, { ct: (e.ct[0] === 'A' ? 'B' : 'A') + e.ct.slice(1) }));
  await assert.rejects(app.cloud.unseal(tampered, kc), /doesn't open/, 'a changed byte is caught');
});

test('two devices end up with the same board', async () => {
  const server = fakeSync();
  const phone = await device(server, board({ settings: liveSettings(), items: ITEMS }));
  const kc = await phone.cloud.newLockKey(PASS);
  await turnOn(phone, kc);
  assert.equal((await phone.cloud.upload(true)).id, 'b1');

  // a laptop with an empty browser restores with the passphrase
  const laptop = await device(server);
  await turnOn(laptop, await laptop.cloud.keyForEnvelope(PASS, server.backups[0].blob));
  await laptop.cloud.load(server.backups[0], false, server.backups[0].blob);
  await laptop.tick();
  assert.equal(laptop.state().ITEMS.length, 3);
  assert.equal(laptop.state().S.live.url, 'https://sync.test');

  // the phone changes the rent; the laptop picks it up when it opens, without asking
  await phone.cloud.store().update('items/rent', { amt: 950 });
  assert.equal((await phone.cloud.upload()).id, 'b2');
  await laptop.cloud.check();
  await laptop.tick();
  assert.equal(rentOf(laptop), 950);
  assert.equal(laptop.cloud.state().cloudPending, null);
});

test('when both devices changed the board, you pick which one every device uses', async () => {
  const server = fakeSync();
  const phone = await device(server, board({ settings: liveSettings(), items: ITEMS }));
  await turnOn(phone, await phone.cloud.newLockKey(PASS));
  await phone.cloud.upload(true);
  const laptop = await device(server);
  await turnOn(laptop, await laptop.cloud.keyForEnvelope(PASS, server.backups[0].blob));
  await laptop.cloud.load(server.backups[0], false, server.backups[0].blob);

  await laptop.cloud.store().update('items/rent', { amt: 1000 });
  await phone.cloud.store().update('items/claude', { amt: 20 });
  await phone.cloud.upload();

  await laptop.cloud.check();
  await laptop.tick();
  assert.equal(laptop.cloud.state().cloudPending.id, 'b2', 'the laptop asks instead of overwriting');
  assert.equal(rentOf(laptop), 1000, "the laptop's change is still there");
  assert.equal(await laptop.cloud.upload(), null, 'a plain upload is refused too');
  assert.equal(server.backups.length, 2);

  // "Keep this one": the laptop's board becomes the latest, and the phone loads it
  await laptop.cloud.upload(true);
  await phone.cloud.check();
  await phone.tick();
  assert.equal(rentOf(phone), 1000);
});

test("a device's own housekeeping is not an edit, so it never starts a conflict", async () => {
  const server = fakeSync();
  const s = liveSettings(); delete s.fxAuto; // the rate updates itself every day (the default)
  const phone = await device(server, board({ settings: s, items: ITEMS }));
  await turnOn(phone, await phone.cloud.newLockKey(PASS));
  await phone.cloud.upload(true);
  const laptop = await device(server);
  await turnOn(laptop, await laptop.cloud.keyForEnvelope(PASS, server.backups[0].blob));
  await laptop.cloud.load(server.backups[0], false, server.backups[0].blob);
  // on open the laptop refreshes the daily rate, snapshots today's limit and marks a level as seen
  await laptop.cloud.store().update('fin/settings', { fx: 0.8934, fxDate: TODAY, fxSrc: 'ECB ' + TODAY, fxAuto: true, seenLvl: 3 });
  await laptop.cloud.store().update('fin/days', { d: { [TODAY]: { a: 31.03, t: 31.03 } } });
  // meanwhile the phone makes a real change
  await phone.cloud.store().update('items/rent', { amt: 950 });
  await phone.cloud.upload();
  await laptop.cloud.check();
  await laptop.tick();
  assert.equal(laptop.cloud.state().cloudPending, null, 'no question asked');
  assert.equal(rentOf(laptop), 950);
});

test('a rate you typed in yourself is a real setting, and does count as a change', async () => {
  const app = await load({ today: TODAY, board: board({ settings: settings({ fxAuto: false, fx: 0.9 }) }) });
  const before = await app.cloud.boardHash(app.cloud.store().dump());
  await app.cloud.store().update('fin/settings', { fx: 0.91 });
  assert.notEqual(await app.cloud.boardHash(app.cloud.store().dump()), before);
});

test('a sync that changed nothing does not make a new backup', async () => {
  const server = fakeSync();
  const phone = await device(server, board({ settings: liveSettings(), items: ITEMS }));
  await turnOn(phone, await phone.cloud.newLockKey(PASS));
  await phone.cloud.upload(true);
  await phone.cloud.store().update('fin/settings', { live: { lastAt: Date.now(), status: { qonto: { ok: true } } }, acctSync: { qonto: { d: TODAY, at: Date.now(), live: true } } });
  assert.equal((await phone.cloud.upload()).same, true);
  assert.equal(server.backups.length, 1);
});

test('a change is backed up shortly after, not on every tap', async () => {
  const server = fakeSync();
  const phone = await device(server, board({ settings: liveSettings(), items: ITEMS }));
  await turnOn(phone, await phone.cloud.newLockKey(PASS));
  await phone.cloud.upload(true);
  await phone.cloud.store().update('items/rent', { amt: 925 });
  const st = phone.cloud.state();
  assert.ok(st.cloudDirtyAt > 0 && st.cloudTimer, 'a backup is scheduled');
  assert.equal(server.backups.length, 1, 'not sent yet');
});
