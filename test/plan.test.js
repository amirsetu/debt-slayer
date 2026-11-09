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
  const ids = [...list.map(r => r.id)];
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
