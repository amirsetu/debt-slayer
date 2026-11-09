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
