// The daily limit: how much can go out today so every bill in the plan still gets paid and the cushion stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { TODAY, settings, board, ITEMS } from './fixtures/demo.js';

const near = (got, want, what) => assert.ok(Math.abs(got - want) < 0.005, `${what}: got ${got}, want ${want}`);
const rentOn15 = Object.assign({}, ITEMS.rent, { start: '2026-01-15', day: 15, amt: 800 });
const salaryOn25 = { name: 'Salary', amt: 2000, cur: 'EUR', freq: 'monthly', start: '2026-01-25', day: 25, acct: 'qonto', income: true };

test('with no bills, everything above the cushion spreads over the plan', async () => {
  const app = await load({ today: TODAY, board: board() });
  const R = app.compute();
  near(R.now, 1000, 'balance');
  near(R.allow, 900 / 29, 'daily limit'); // (€1,000 − €100 cushion) over today + 28 days
  assert.equal(R.bindDate, '2026-12-08');
});

test('a bill coming up lowers the limit from today', async () => {
  const app = await load({ today: TODAY, board: board({ items: { rent: rentOn15 } }) });
  const R = app.compute();
  near(R.low, 200, 'lowest balance');
  assert.equal(R.lowDate, '2026-11-15');
  near(R.allow, 100 / 29, 'daily limit'); // only €100 above the cushion after rent, spread to the end of the plan
});

test('income only helps from the day it lands', async () => {
  const app = await load({ today: TODAY, board: board({ items: { rent: rentOn15, salary: salaryOn25 } }) });
  const R = app.compute();
  near(R.allow, 100 / 15, 'daily limit'); // the tight stretch is 10 to 24 Nov, before the salary
  assert.equal(R.bindDate, '2026-11-24');
});

test("spending today comes out of today's money, not out of the limit", async () => {
  const txns = { coffee: { kind: 'exp', date: TODAY, eur: 20, orig: 20, cur: 'EUR', acct: 'qonto', cat: 'Food & dinner', at: 1 } };
  const app = await load({ today: TODAY, board: board({ txns }) });
  const R = app.compute();
  near(R.now, 980, 'balance after the coffee');
  near(R.allow, 900 / 29, 'daily limit stays');
  near(R.spentToday, 20, 'spent today');
  near(R.left, 900 / 29 - 20, 'left today');
});

test('a USD bill costs its amount at the rate after the Wise fee', async () => {
  const s = settings({ fx: 0.9, fee: 1 });
  const usdBill = { name: 'Hosting', amt: 100, cur: 'USD', freq: 'monthly', start: '2026-01-12', day: 12, acct: 'qonto' };
  const app = await load({ today: TODAY, board: board({ settings: s, items: { host: usdBill } }) });
  const [o] = app.occ('2026-11-12', '2026-11-12');
  near(o.v, -100 * 0.9 * 0.99, 'euros out');
});

test('on a live account, a bill due today counts until the bank shows it went out', async () => {
  const s = settings({ acctSync: { qonto: { d: TODAY, at: 5, live: true } } });
  const rentToday = Object.assign({}, ITEMS.rent, { start: '2026-01-10', day: 10 });
  const open = await load({ today: TODAY, board: board({ settings: s, items: { rent: rentToday } }) });
  near(open.compute().now, 100, 'balance with rent still to go');

  const paid = await load({ today: TODAY, board: board({ settings: s, items: { rent: rentToday }, marks: { done: { 'rent@2026-11-10': 1 }, ov: {} } }) });
  near(paid.compute().now, 1000, 'the bank balance already has it');
});
