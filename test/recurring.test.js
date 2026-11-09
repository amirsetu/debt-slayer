// Repeating charges the bank shows, offered as bills when they aren't on your list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { TODAY, settings, board, ITEMS, ACCOUNTS } from './fixtures/demo.js';

const live = () => settings({ live: { url: 'https://sync.test', since: '2026-11-01', map: { 'mock:qonto': 'qonto', 'mock:wise:EUR': 'wise' } } });
const found = [
  { key: 'anthropic', name: 'ANTHROPIC, PBC', cents: 1800, currency: 'EUR', cadence: 'monthly', every: 30.4, day: 10, next: '2026-12-10', account_id: 'mock:qonto' },        // = Claude Business, by name
  { key: 'hausverwaltung nord', name: 'Hausverwaltung Nord', cents: 90000, currency: 'EUR', cadence: 'monthly', every: 30.4, day: 9, next: '2026-12-09', account_id: 'mock:qonto' }, // = Rent, by amount
  { key: 'netflix', name: 'Netflix.com', cents: 1399, currency: 'EUR', cadence: 'monthly', every: 30.4, day: 5, next: '2026-12-05', account_id: 'mock:wise:EUR' },
  { key: 'urban sports', name: 'Urban Sports GmbH', cents: 4500, currency: 'EUR', cadence: 'weekly', every: 7, day: 8, next: '2026-11-15', account_id: 'mock:wise:EUR' },
];

test('only charges that are not already bills are offered', async () => {
  const app = await load({ today: TODAY, board: board({ settings: Object.assign(live(), { recurIgnore: { 'urban sports': true } }), items: ITEMS }), storage: { 'debtslayer.liveKey': 'k' } });
  app.setRecurring(found);
  assert.equal([...app.untracked().map(r => r.key)].join(), 'netflix');
});

test('one tap adds it as a bill from its next date, matched by name from then on', async () => {
  const app = await load({ today: TODAY, board: board({ settings: live(), items: ITEMS }), storage: { 'debtslayer.liveKey': 'k' } });
  app.setRecurring(found);
  await app.addRecurring('netflix');
  await app.addRecurring('urban sports');
  await app.tick();
  const { ITEMS: items } = app.state();
  const nf = items.find(i => i.name === 'Netflix'), gym = items.find(i => i.name === 'Urban Sports');
  assert.deepEqual([nf.amt, nf.cur, nf.freq, nf.start, nf.day, nf.acct, nf.match], [13.99, 'EUR', 'monthly', '2026-12-05', 5, 'wise', 'netflix']);
  assert.deepEqual([gym.freq, gym.every, gym.start], ['days', 7, '2026-11-15']);
  assert.equal(app.untracked().length, 0, 'nothing left to offer');
});

test('bank history from months back never ticks old bills', async () => {
  const s = live();
  const app = await load({ today: TODAY, board: board({ settings: s, items: ITEMS }) });
  const old = { id: 'mock:rent-aug', provider: 'mock', account_id: 'mock:qonto', amount_cents: -90000, currency: 'EUR', kind: 'transfer', counterparty: 'Hausverwaltung Nord', description: '', status: 'completed', booked_at: '2026-08-09T10:00:00Z' };
  const out = await app.applyFeed(ACCOUNTS, [old], 1, {}, []);
  await app.tick();
  assert.equal(out.matched, 0);
  assert.equal(app.state().MARKS.done['rent@2026-08-09'], undefined);
  assert.equal(app.state().LIVE.seen['mock:rent-aug'].t, 'skip');
});
