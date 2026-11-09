// Live sync: what the app does with transactions from the banks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { TODAY, settings, board, ITEMS, ACCOUNTS, FEED, OWNERS } from './fixtures/demo.js';

async function synced() {
  const s = settings({ live: { url: 'https://sync.test', since: '2026-11-08' } });
  const app = await load({ today: TODAY, board: board({ settings: s, items: ITEMS }) });
  const out = await app.applyFeed(ACCOUNTS, FEED, 123, {}, OWNERS);
  await app.tick();
  return { app, out };
}
const byExt = (app, id) => app.state().TXNS.find(t => t.ext === 'mock:' + id);

test('bills that went through are ticked, by name or by exact amount', async () => {
  const { app, out } = await synced();
  const { MARKS } = app.state();
  assert.equal(out.matched, 3);
  assert.ok(MARKS.done['claude@2026-11-10'], 'ANTHROPIC, PBC ticks Claude Business');
  assert.ok(MARKS.done['resend@2026-11-08'], 'Resend ticks Resend');
  assert.ok(MARKS.done['rent@2026-11-09'], '€900 to the landlord ticks Rent, a day late');
  assert.equal(byExt(app, 'anthropic'), undefined, 'a ticked bill is not logged a second time as spending');
});

test('a bill that cost a different amount keeps the real amount', async () => {
  const { app } = await synced();
  assert.equal(app.state().MARKS.ov['resend@2026-11-08'].amt, 19.5);
});

test('card spending is logged with a category, and pending stays pending', async () => {
  const { app, out } = await synced();
  assert.equal(out.logged, 2);
  const lidl = byExt(app, 'lidl'), coffee = byExt(app, 'coffee');
  assert.equal(lidl.kind, 'exp'); assert.equal(lidl.eur, 23.4); assert.equal(lidl.cat, 'Groceries'); assert.equal(lidl.acct, 'wise'); assert.equal(lidl.src, 'live');
  assert.equal(coffee.cat, 'Food & dinner'); assert.equal(coffee.pending, true);
});

test('money moving between your accounts is one move, not spending plus income', async () => {
  const { app, out } = await synced();
  assert.equal(out.moved, 1);
  const move = byExt(app, 'move-out');
  assert.equal(move.kind, 'xfer'); assert.equal(move.eur, 50); assert.equal(move.acct, 'wise'); assert.equal(move.to, 'qonto');
  assert.equal(byExt(app, 'move-in'), undefined);
});

test('your own money and anything from before you connected are not logged', async () => {
  const { app } = await synced();
  const { LIVE, TXNS } = app.state();
  assert.equal(LIVE.seen['mock:own-in'].t, 'own');
  assert.equal(LIVE.seen['mock:old'].t, 'skip');
  assert.ok(!TXNS.some(t => /Demo Studio|Some Shop/.test(t.note || '')));
});

test('balances and the cursor come from the feed', async () => {
  const { app } = await synced();
  const { S } = app.state();
  assert.equal(S.balances.qonto, 214.5);
  assert.equal(S.balances.wise, 89.12);
  assert.equal(S.live.cursor, 123);
  assert.equal(S.live.url, 'https://sync.test', 'the sync address survives');
  assert.equal(S.acctSync.qonto.live, true);
});

test('syncing the same feed again changes nothing', async () => {
  const { app } = await synced();
  const before = app.state().TXNS.length;
  const again = await app.applyFeed(ACCOUNTS, FEED, 124, {}, OWNERS);
  await app.tick();
  assert.deepEqual([again.matched, again.logged, again.moved, again.updated], [0, 0, 0, 0]);
  assert.equal(app.state().TXNS.length, before);
});

test('a pending payment that settles updates the one already logged', async () => {
  const { app } = await synced();
  const settled = FEED.map(t => (t.id === 'mock:coffee' ? Object.assign({}, t, { status: 'completed' }) : t));
  const out = await app.applyFeed(ACCOUNTS, settled, 125, {}, OWNERS);
  await app.tick();
  assert.equal(out.updated, 1);
  assert.equal(byExt(app, 'coffee').pending, null);
});

test('statement names match bills through common aliases', async () => {
  const app = await load({ today: TODAY });
  assert.equal(app.matchName({ name: 'Claude Business' }, 'ANTHROPIC, PBC'), true);
  assert.equal(app.matchName({ name: 'Meta' }, 'FACEBK *8YT2KL'), true);
  assert.equal(app.matchName({ name: 'Rent' }, 'Miete November'), true);
  assert.equal(app.matchName({ name: 'Gym', match: 'urban sports' }, 'URBAN SPORTS CLUB'), true);
  assert.equal(app.matchName({ name: 'Health insurance' }, 'Health shop'), false, 'generic words alone never match');
});

test('every bill the bank ticked keeps a receipt: which payment, and how it matched', async () => {
  const { app } = await synced();
  const via = app.state().MARKS.via;
  assert.equal(via['claude@2026-11-10'].ext, 'mock:anthropic');
  assert.equal(via['claude@2026-11-10'].name, 'ANTHROPIC, PBC');
  assert.equal(via['claude@2026-11-10'].by, 'name');
  assert.equal(via['rent@2026-11-09'].by, 'amount');
  assert.equal(via['rent@2026-11-09'].eur, 900);
});

test('logged bank payments are named after the bank id', async () => {
  const { app } = await synced();
  assert.equal(byExt(app, 'lidl').id, 'b_mock_lidl');
  assert.equal(byExt(app, 'move-out').id, 'b_mock_move-out');
});

test('a sync cut off before it saved what it had seen logs nothing twice', async () => {
  const { app } = await synced();
  const before = app.state().TXNS.length;
  await app.cloud.store().set('fin/live', { seen: {} }); // the "seen" note never got saved
  await app.tick();
  const again = await app.applyFeed(ACCOUNTS, FEED, 124, {}, OWNERS);
  await app.tick();
  assert.equal(app.state().TXNS.length, before, 'same payments, same ids: overwritten, not doubled');
  assert.equal(again.matched, 0);
  assert.equal(byExt(app, 'anthropic'), undefined, 'the ticked bill is not logged as spending as well');
  assert.equal(app.state().LIVE.seen['mock:anthropic'].t, 'occ');
});

test('"Not this bill" unticks it and logs the bank payment on its own', async () => {
  const { app } = await synced();
  await app.unmatchBill('claude@2026-11-10');
  await app.tick();
  const { MARKS, LIVE } = app.state();
  assert.equal(MARKS.done['claude@2026-11-10'], null);
  assert.equal(MARKS.via['claude@2026-11-10'], null);
  const t = byExt(app, 'anthropic');
  assert.deepEqual([t.kind, t.eur, t.note, t.acct], ['exp', 18, 'ANTHROPIC, PBC', 'qonto']);
  assert.equal(LIVE.seen['mock:anthropic'].t, 'txn');
  const again = await app.applyFeed(ACCOUNTS, FEED, 124, {}, OWNERS);
  await app.tick();
  assert.equal(again.matched, 0, 'it is not matched to the bill again');
  assert.equal(app.state().MARKS.done['claude@2026-11-10'], null);
});

test('a payment the bank cancels unticks its bill again', async () => {
  const { app } = await synced();
  const cancelled = FEED.map(t => (t.id === 'mock:anthropic' ? Object.assign({}, t, { status: 'cancelled' }) : t));
  await app.applyFeed(ACCOUNTS, cancelled, 125, {}, OWNERS);
  await app.tick();
  assert.equal(app.state().MARKS.done['claude@2026-11-10'], null);
  assert.equal(app.state().MARKS.via['claude@2026-11-10'], null);
});

test('a bank that keeps failing, or a sync service that is down, shows a warning on Home', async () => {
  const s = settings({ live: { url: 'https://sync.test', since: TODAY, lastAt: Date.now() - 2 * 3600e3, status: { qonto: { ok: false, fails: 1, error: 'Qonto 503', lastOk: '2026-11-10T08:00:00Z' } } } });
  const app = await load({ today: TODAY, board: board({ settings: s }), storage: { 'debtslayer.liveKey': 'k' } });
  assert.equal(app.liveAlert(), '', 'one failure can be a blip');
  await app.cloud.store().update('fin/settings', { live: { status: { qonto: { ok: false, fails: 2, error: 'Qonto 503', lastOk: '2026-11-10T08:00:00Z' } } } });
  await app.tick();
  assert.match(app.liveAlert(), /Qonto<\/b> hasn't synced since .*Qonto 503/);
  await app.cloud.store().update('fin/settings', { live: { status: { qonto: { ok: true, fails: 0 } } } });
  await app.tick();
  assert.equal(app.liveAlert(), '');
  app.setLiveErr('the sync service answered 500');
  assert.match(app.liveAlert(), /can't be reached: the sync service answered 500/);
});
