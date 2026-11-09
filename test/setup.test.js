// First-run setup for a new board.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

test('the next date on a day of the month is today or later', async () => {
  const app = await load({ today: '2026-11-10' });
  assert.equal(app.nextOn(10), '2026-11-10');
  assert.equal(app.nextOn(25), '2026-11-25');
  assert.equal(app.nextOn(1), '2026-12-01');
  const feb = await load({ today: '2027-01-31' });
  assert.equal(feb.nextOn(31), '2027-01-31');
  const feb2 = await load({ today: '2027-02-01' });
  assert.equal(feb2.nextOn(31), '2027-02-28', 'short months end on their last day');
});

test('setup makes a board: accounts, balances, pay and the bills you typed', async () => {
  const app = await load({ today: '2026-11-10' });
  app.setSetup({ step: 4, name: 'Sam', buffer: '200', living: '500',
    accounts: [{ id: 'main', name: 'N26', bal: '1.250,50' }, { id: 'savings', name: 'Savings', bal: '' }, { id: 'x', name: '  ', bal: '9' }],
    pay: { amt: '2,500', cur: 'USD', day: '25', acct: 'main', none: false },
    bills: [{ name: 'Rent', cat: 'Home', amt: '850', day: '1' }, { name: 'Gym', cat: 'Personal', amt: '', day: '1' }, { name: 'Phone', cat: 'Phone & internet', amt: '19,99', day: '12' }] });
  const { settings, items } = app.setupBoard();
  assert.equal(settings.name, 'Sam');
  assert.deepEqual([settings.buffer, settings.living], [200, 500]);
  assert.equal(settings.accounts.map(a => a.name).join(), 'N26,Savings', 'unnamed accounts are dropped');
  assert.deepEqual(Object.assign({}, settings.balances), { main: 1250.5, savings: 0 });
  assert.equal(settings.syncs[0].total, 1250.5);
  const list = Object.values(items);
  const pay = list.find(i => i.income), rent = list.find(i => i.name === 'Rent'), phone = list.find(i => i.name === 'Phone');
  assert.deepEqual([pay.amt, pay.cur, pay.start, pay.acct], [2500, 'USD', '2026-11-25', 'main']);
  assert.deepEqual([rent.amt, rent.start, rent.cat], [850, '2026-12-01', 'Home']);
  assert.deepEqual([phone.amt, phone.start], [19.99, '2026-11-12']);
  assert.equal(list.length, 3, 'empty bills are left out');
});

test('irregular income adds no pay date', async () => {
  const app = await load({ today: '2026-11-10' });
  app.setSetup({ step: 4, name: '', buffer: '150', living: '600', accounts: [{ id: 'main', name: 'Main account', bal: '' }],
    pay: { amt: '3000', cur: 'EUR', day: '1', acct: 'main', none: true }, bills: [] });
  const { settings, items } = app.setupBoard();
  assert.equal(Object.keys(items).length, 0);
  assert.equal(settings.syncs.length, 0, 'no balances typed: Home asks for them');
});
