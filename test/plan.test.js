// Bill reminders the app hands to the sync service for notifications.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { TODAY, settings, board, ITEMS } from './fixtures/demo.js';

const local = (y, m, d, h) => new Date(y, m - 1, d, h).toISOString();

async function plan(extraMarks = {}) {
  const s = settings({ live: { url: 'https://sync.test', since: '2026-11-01', map: { 'mock:qonto': 'qonto', 'mock:wise:EUR': 'wise' } }, notify: { bills: true } });
  const phone = { name: 'Phone', amt: 20, cur: 'EUR', freq: 'monthly', start: '2026-01-12', day: 12, acct: 'spk', cat: 'Phone & internet' };
  const salary = { name: 'Salary', amt: 2000, cur: 'EUR', freq: 'monthly', start: '2026-01-11', day: 11, acct: 'qonto', income: true };
  const app = await load({ today: TODAY, board: board({ settings: s, items: Object.assign({}, ITEMS, { phone, salary }), marks: { done: Object.assign({ 'claude@2026-11-10': 1 }, extraMarks), ov: {} } }) });
  return { app, list: app.buildPlan() };
}

test('a reminder the morning a bill is due, and a check two days later on synced accounts', async () => {
  const { list } = await plan();
  const ids = [...list.filter(r => r.kind === 'due' || r.kind === 'late').map(r => r.id)];
  assert.deepEqual(ids, [
    'late:resend@2026-11-08:2026-11-08',
    'late:rent@2026-11-09:2026-11-09',
    'due:phone@2026-11-12:2026-11-12',
  ]);
  const phone = list.find(r => r.id.startsWith('due:phone'));
  assert.equal(phone.at, local(2026, 11, 12, 9));
  assert.equal(phone.title, 'Phone is due today');
  assert.equal(phone.body, '€20.00 from Sparkasse');
  assert.equal(phone.check, undefined, 'Sparkasse is not synced, so no bank check');
});

test('the bank check carries what the service needs to spot the payment', async () => {
  const { list } = await plan();
  const rent = list.find(r => r.id.startsWith('late:rent'));
  assert.equal(rent.at, local(2026, 11, 11, 10));
  assert.equal(rent.title, "Rent hasn't gone out");
  assert.match(rent.body, /^€900\.00 was due Mon 9 Nov\. Qonto hasn't shown it yet\.$/);
  assert.equal(rent.check.after, '2026-11-05');
  assert.equal(rent.check.accounts.join(), 'mock:qonto');
  assert.equal(rent.check.cents, 90000);
  assert.equal(rent.check.words.join(), 'rent,miete');
});

test('paid bills, income and anything ticked drop out', async () => {
  const { list } = await plan({ 'rent@2026-11-09': 1 });
  assert.ok(!list.some(r => /claude|salary|rent/.test(r.id)));
});

test('the words to look for come from the name, the aliases and your own match words', async () => {
  const { app } = await plan();
  assert.equal(app.matchWords({ name: 'Claude Business' }).join(), 'claude,anthropic');
  assert.equal(app.matchWords({ name: 'Gym', match: 'Urban Sports, USC' }).join(), 'gym,urban sports,usc');
});

test('"Boss down" waits for the last payment of a debt on a synced account', async () => {
  const s = settings({ live: { url: 'https://sync.test', since: '2026-11-01', map: { 'mock:qonto': 'qonto', 'mock:wise:EUR': 'wise' } } });
  const klarna = { name: 'Dyson', group: 'Klarna', amt: 85, cur: 'EUR', freq: 'monthly', start: '2026-09-20', day: 20, count: 3, acct: 'wise', debt: true, cat: 'Klarna' };
  const app = await load({ today: TODAY, board: board({ settings: s, items: { dyson: klarna } }) });
  const win = [...app.buildPlan()].filter(r => r.kind === 'win');
  assert.equal(win.length, 1);
  assert.equal(win[0].id, 'win:dyson@2026-11-20');
  assert.equal(win[0].title, 'Boss down: Klarna · Dyson');
  assert.equal(win[0].at, local(2026, 11, 16, 0));
  assert.equal(win[0].until, local(2026, 11, 30, 0));
  assert.equal(win[0].check.cents, 8500);
  assert.equal(win[0].check.words.join(), 'dyson,klarna');
});

test('an 8pm streak check for each day this week, with today\'s spending and the bills to leave out', async () => {
  const { list } = await plan();
  const days = list.filter(r => r.kind === 'streak');
  assert.equal(days.length, 7);
  assert.equal(days[0].id, 'streak:2026-11-10');
  assert.equal(days[0].at, local(2026, 11, 10, 20));
  assert.equal(days[0].day.accounts.join(), 'mock:qonto,mock:wise:EUR');
  assert.ok(days[0].day.limit > 0);
  // bills within a day of today, ticked or not, so their card charges never count as spending
  assert.equal(days[0].day.skip.map(b => b.cents).join(), '90000,1800', 'Rent (yesterday) and Claude (today)');
  assert.equal(days[1].day.spent, 0);
});
