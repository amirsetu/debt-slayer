// The streak: days in a row under your limit. Days the app stayed closed count when the bank covered them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { TODAY, settings, board } from './fixtures/demo.js';

const spend = (date, eur, live) => ({ kind: 'exp', date, eur, orig: eur, cur: 'EUR', acct: 'qonto', cat: 'Food & dinner', at: 1, ...(live ? { src: 'live' } : {}) });
const days = { d: { '2026-11-06': { a: 30, t: 30 }, '2026-11-07': { a: 30, t: 30 } } }; // the app was open on the 6th and 7th only
const txns = { a: spend('2026-11-06', 10), b: spend('2026-11-07', 20), c: spend('2026-11-08', 25, true), d: spend('2026-11-09', 5, true) };
async function streakWith(liveExtra, extraTxns = {}) {
  const s = settings(liveExtra ? { live: Object.assign({ url: 'https://sync.test', since: '2026-11-01' }, liveExtra) } : {});
  const docs = board({ settings: s, txns: Object.assign({}, txns, extraTxns) });
  docs['fin/days'] = days;
  const app = await load({ today: TODAY, board: docs });
  return app.progress();
}

test('without bank data, days the app stayed closed break the streak', async () => {
  const p = await streakWith(null);
  assert.equal(p.streak, 0);
  assert.equal(p.best, 2);
});

test('days the bank covered count, judged by the last limit you saw', async () => {
  const p = await streakWith({ lastAt: Date.parse('2026-11-10T09:00:00') });
  assert.equal(p.streak, 4);
  assert.equal(p.best, 4);
});

test('going over on a day the app stayed closed still breaks it', async () => {
  const p = await streakWith({ lastAt: Date.parse('2026-11-10T09:00:00') }, { c2: spend('2026-11-08', 20, true) }); // €45 on the 8th
  assert.equal(p.streak, 1);
});

test("a day the bank hasn't finished reporting isn't judged yet", async () => {
  const p = await streakWith({ lastAt: Date.parse('2026-11-09T18:00:00') }); // last sync before the 9th ended
  assert.equal(p.streak, 0);
  assert.equal(p.best, 3, 'the 6th to the 8th still count');
});
