// Home and the Month view show what the bank took today, not only the "Spent" number: the payment you got a
// notification for is right there, and tapping a day shows what happened before what was planned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { TODAY, settings, board } from './fixtures/demo.js';

const live = (id, note, eur, acct, extra = {}) => Object.assign({ kind: 'exp', date: TODAY, eur, orig: eur, cur: 'EUR', acct, cat: 'Groceries', note, src: 'live', ext: id, at: 1000 }, extra);

async function app(txns) {
  const s = settings({ live: { url: 'https://sync.test', since: '2026-11-01', map: { 'wise:1:EUR': 'wise' } } });
  return load({ today: TODAY, board: board({ settings: s, txns }), storage: { 'debtslayer.liveKey': 'k' } });
}

test('Home lists what left your accounts today, newest first, with the total', async () => {
  const a = await app({
    b_1: live('w1', 'BIO COMPANY', 17.68, 'wise', { at: 1000 }),
    b_2: live('w2', 'Lime', 6.13, 'wisep', { cat: 'Transport', at: 3000, pending: true }),
    b_3: live('w3', 'WEB*BLUEHOST.COM', 39.75, 'paypal', { cat: 'Other', at: 2000 }),
    b_old: live('w0', 'Meta', 26, 'qonto', { date: '2026-11-09' }),
  });
  const html = a.view('hq');
  const today = html.slice(html.indexOf('Today so far'));
  assert.ok(html.includes('Today so far'), 'a Today list on Home');
  assert.match(today, /Lime[\s\S]*WEB\*BLUEHOST\.COM[\s\S]*BIO COMPANY/, 'newest first');
  assert.match(today, /−€63\.56 out/);
  assert.match(today, /pending at bank/);
  assert.ok(!today.slice(0, today.indexOf('Next 10 days')).includes('Meta'), "yesterday's payment is not today's");
  assert.match(html, /data-act="totoday"[^>]*>Spent €63\.56 ›/, 'the Spent number leads to the list');
});

test('with nothing today, Home says so', async () => {
  const a = await app({});
  assert.match(a.view('hq'), /Nothing has left your accounts today/);
});

test('tapping a day in Month: what happened first, then the bills planned for it', async () => {
  const a = await app({ b_1: live('w1', 'BIO COMPANY', 17.68, 'wise'), b_2: live('w2', 'Lime', 6.13, 'wisep', { cat: 'Transport', at: 3000 }) });
  const html = a.dayHtml(TODAY);
  assert.match(html, /Today so far<\/h2>[\s\S]*−€23\.81 out[\s\S]*Lime[\s\S]*BIO COMPANY/);
  const later = a.dayHtml('2026-11-30');
  assert.ok(!later.includes('Today so far') && !later.includes('What happened'), 'a future day only has what is planned');
  assert.match(a.dayHtml('2026-11-09'), /No bills or income scheduled|Bills and income|Tap a payment/);
});
