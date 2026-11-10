// Receipts: the History › Receipts screen, and the month / quarter / year export the phone builds (a ZIP with every file
// and a spreadsheet). The sync service is a stand-in that answers with a fixed list and fixed files.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { load } from './harness.js';
import { TODAY, settings, board } from './fixtures/demo.js';

const pay = (id, date, cents, payee, business, receipts = [], extra = {}) => Object.assign({ id, date, account: business ? 'qonto:1' : 'eb:spk', accountName: business ? 'Qonto · Main' : 'Sparkasse · Girokonto …3000',
  amount_cents: cents, currency: 'EUR', payee, kind: 'card', business, noReceipt: false, receipts }, extra);
const rec = (id, vendor, cents, file, extra = {}) => Object.assign({ id, source: 'gmail', vendor, amount_cents: cents, currency: 'EUR', invoice_date: '2026-11-03', invoice_no: 'R-1', vat_cents: 162, read_by: 'haiku', status: 'matched', files: [file] }, extra);
const LIST = {
  from: '2026-11-01', to: '2026-11-30',
  payments: [
    pay('tx-hetzner', '2026-11-04', 1012, 'Hetzner Online GmbH', true, [rec('gm:m3', 'Hetzner Online GmbH', 1012, { id: 'gm:m3:0', name: 'Hetzner_R0001.pdf', type: 'application/pdf' })]),
    pay('tx-anthropic', '2026-11-09', 1735, 'ANTHROPIC, PBC', true, [rec('gm:m1', 'Anthropic, PBC', 2000, { id: 'gm:m1:e', name: 'email.html', type: 'text/html' }, { currency: 'USD', read_by: 'email' })]),
    pay('tx-meta', '2026-11-07', 4999, '=FACEBK *ADS', true),
    pay('tx-lidl', '2026-11-06', 2340, 'LIDL DIENSTL', false),
    pay('tx-bvg', '2026-11-02', 300, 'BVG Ticket', false, [], { noReceipt: true }),
  ],
  unmatched: [rec('gm:m9', 'Figma', 1500, { id: 'gm:m9:0', name: 'invoice.pdf', type: 'application/pdf' }, { status: 'unmatched', invoice_date: '2026-11-08' })],
  accounts: [], status: { at: '2026-11-10T08:00:00Z', left: 0 }, inboxes: [{ email: 'me@example.com', from: '2026-10-01' }],
};
const FILES = { 'gm:m3:0': '%PDF-1.4 hetzner', 'gm:m1:e': '<p>Amount paid $20.00</p>', 'gm:m9:0': '%PDF-1.4 figma' };

async function app(calls = []) {
  const fetch = async (url, init = {}) => {
    const u = new URL(url); calls.push(u.pathname + u.search);
    if (u.pathname === '/v1/receipts') return new Response(JSON.stringify(LIST), { status: 200 });
    const f = u.pathname.match(/^\/v1\/receipts\/file\/(.+)$/);
    if (f && FILES[decodeURIComponent(f[1])]) return new Response(FILES[decodeURIComponent(f[1])], { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const s = settings({ live: { url: 'https://sync.test', since: '2026-11-01' } });
  return load({ today: TODAY, board: board({ settings: s }), storage: { 'debtslayer.liveKey': 'k' }, fetch });
}

/** read a ZIP back: every entry's name and bytes, checking each CRC against Node's own */
function unzip(u8) {
  const b = Buffer.from(u8), out = {};
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end > 0, 'has an end record');
  const n = b.readUInt16LE(end + 10), dirAt = b.readUInt32LE(end + 16);
  for (let i = 0, p = dirAt; i < n; i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50);
    const crc = b.readUInt32LE(p + 16), size = b.readUInt32LE(p + 24), nl = b.readUInt16LE(p + 28), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    assert.equal(b.readUInt32LE(off), 0x04034b50, 'local header for ' + name);
    const data = b.subarray(off + 30 + b.readUInt16LE(off + 26), off + 30 + b.readUInt16LE(off + 26) + size);
    if (zlib.crc32) assert.equal(zlib.crc32(data), crc, 'crc of ' + name);
    out[name] = data;
    p += 46 + nl;
  }
  return out;
}

test('a ZIP the phone builds opens anywhere: stored entries, UTF-8 names, right CRCs', async () => {
  const a = await app();
  const enc = new TextEncoder();
  const zip = a.receipts.zipStore([{ name: 'a.txt', data: enc.encode('hello') }, { name: 'Büro/Rechnung €.pdf', data: enc.encode('%PDF') }]);
  const files = unzip(zip);
  assert.deepEqual(Object.keys(files), ['a.txt', 'Büro/Rechnung €.pdf']);
  assert.equal(files['a.txt'].toString(), 'hello');
  assert.equal(a.receipts.crc32(enc.encode('123456789')), 0xCBF43926, 'the standard CRC-32 check value');
});

test('month, quarter and year cover the right dates', async () => {
  const a = await app();
  const span = (s, m) => { const r = a.receipts.span(s, m); return [r.from, r.to, r.label]; };
  assert.deepEqual(span('month', '2026-11'), ['2026-11-01', '2026-11-30', '2026-11']);
  assert.deepEqual(span('quarter', '2026-11'), ['2026-10-01', '2026-12-31', '2026-Q4']);
  assert.deepEqual(span('quarter', '2027-02'), ['2027-01-01', '2027-03-31', '2027-Q1']);
  assert.deepEqual(span('year', '2026-11'), ['2026-01-01', '2026-12-31', '2026']);
});

test('the business export: its receipts as files, every payment in the spreadsheet, missing ones marked', async () => {
  const calls = [], a = await app(calls);
  const out = await a.receipts.exportZip('month', '2026-11', 'business');
  assert.equal(out.name, 'Debt Slayer receipts 2026-11 business.zip');
  assert.deepEqual([out.payments, out.withReceipt, out.missing, out.loose, out.files, out.failed], [3, 2, 1, 1, 3, 0]);
  const files = unzip(out.bytes);
  assert.deepEqual(Object.keys(files).sort(), ['2026-11/2026-11-04 Hetzner Online GmbH 10,12 EUR.pdf', '2026-11/2026-11-09 Anthropic, PBC 17,35 EUR.html', 'README.txt',
    'Receipts without a payment/2026-11-08 Figma 15,00 EUR.pdf', 'receipts.csv'].sort());
  assert.equal(files['2026-11/2026-11-04 Hetzner Online GmbH 10,12 EUR.pdf'].toString(), '%PDF-1.4 hetzner');

  const csv = files['receipts.csv'].toString('utf8');
  assert.ok(csv.startsWith('﻿Date;Paid to;Amount;'), 'BOM and semicolons, so Excel opens it right');
  const rows = csv.trim().split('\r\n').map(r => r.split(';'));
  assert.equal(rows.length, 1 + 3 + 1);
  assert.deepEqual(rows[1].slice(0, 7), ['2026-11-04', 'Hetzner Online GmbH', '10,12', 'EUR', 'Qonto · Main', 'Business', 'yes']);
  assert.equal(rows[1][12], '1,62', 'VAT');
  const meta = rows.find(r => r[0] === '2026-11-07');
  assert.equal(meta[1], "'=FACEBK *ADS", 'a payee that looks like a formula is not run as one');
  assert.equal(meta[6], 'MISSING');
  assert.ok(!csv.includes('LIDL'), 'private payments stay out of the business export');
  assert.match(rows[4][6], /receipt only/);
  assert.ok(calls.includes('/v1/receipts?from=2026-11-01&to=2026-11-30'));
});

test('the "all" export splits business and private, and counts "no receipt needed" as done', async () => {
  const a = await app();
  const out = await a.receipts.exportZip('month', '2026-11', 'all');
  assert.equal(out.name, 'Debt Slayer receipts 2026-11.zip');
  assert.deepEqual([out.payments, out.withReceipt, out.notNeeded, out.missing], [5, 2, 1, 2]);
  const names = Object.keys(unzip(out.bytes));
  assert.ok(names.includes('Business/2026-11/2026-11-04 Hetzner Online GmbH 10,12 EUR.pdf'), names.join('\n'));
  assert.match(out.csv, /BVG Ticket;3,00;EUR;[^;]+;Private;not needed/);
});

test('History › Receipts shows how many payments still need a receipt', async () => {
  const a = await app();
  a.receipts.set('2026-11', LIST);
  a.receipts.mode('rc', 'business');
  const html = a.receipts.log();
  assert.match(html, /Payments<\/span><b>3<\/b>/);
  assert.match(html, /With receipt<\/span><b class="good">2<\/b>/);
  assert.match(html, /Missing<\/span><b class="bad">1<\/b>/);
  assert.match(html, /=FACEBK \*ADS.*tag miss|tag miss.*=FACEBK/s);
  assert.ok(!html.includes('LIDL'), 'business only');
  assert.match(html, /Receipts without a payment[\s\S]*Figma/);
  assert.match(html, /data-act="rcexport" data-span="quarter">Q4 2026/);
  a.receipts.mode('rc', 'private');
  assert.match(a.receipts.log(), /LIDL DIENSTL/);
  a.receipts.mode('all');
  assert.match(a.receipts.log(), /Everything that happened/, 'the switch goes back to the usual history');
});

test('settings: Gmail not set up, then set up with two inboxes and the account types', async () => {
  const a = await app();
  a.receipts.setGm({ configured: false, inboxes: [] });
  assert.match(a.receipts.gmBlock(), /Not set up on your sync service yet/);
  a.receipts.setGm({ configured: true, reader: true, inboxes: [{ email: 'a@example.com', from: '2026-10-01' }, { email: 'b@example.com', from: '2026-10-01' }],
    accounts: [{ id: 'qonto:1', name: 'Qonto · Main', type: 'business' }, { id: 'eb:spk', name: 'Sparkasse', type: 'private' }] });
  const html = a.receipts.gmBlock();
  assert.match(html, /a@example\.com[\s\S]*b@example\.com/);
  assert.match(html, /Connect another Gmail/);
  assert.match(html, /Claude Haiku reads it/);
  assert.match(html, /data-gmacct="qonto:1"><option value="business" selected>/);
  assert.match(html, /data-gmacct="eb:spk"><option value="business" >Business<\/option><option value="private" selected>/);
});

test('a missing receipt says what the Gmail search found; PayPal payments name the bank; statements are kept apart', async () => {
  const a = await app();
  const list = JSON.parse(JSON.stringify(LIST));
  list.payments[2].hunt = { term: 'facebk', tries: 1, found: 0, at: '2026-11-08T10:00:00Z' };
  list.payments.push(pay('pp-ads', '2026-11-05', 2200, 'Meta Platforms', true, [], { account: 'paypal:EUR', accountName: 'PayPal · EUR', via: 'Sparkasse Mittelthüringen · Girokonto …3000' }));
  list.statements = [rec('gm:s1', 'Advanzia Bank S.A.', 604808, { id: 'gm:s1:e', name: 'email.html', type: 'text/html' }, { status: 'statement', subject: 'Gebührenfrei Mastercard Gold - Rechnung' })];
  a.receipts.set('2026-11', list);
  a.receipts.mode('rc', 'business');
  const html = a.receipts.log();
  assert.match(html, /=FACEBK \*ADS[\s\S]*?no email from “facebk”/);
  assert.match(html, /PayPal via Sparkasse/);
  assert.match(html, /Card statements and payment plans<\/b> <span class="muted">\(1\)/);
  assert.ok(!/data-act="rcloose" data-id="gm:s1"/.test(html), 'a statement is not offered as a receipt to attach');
});

test('a payment marked automatically as needing no receipt says why', async () => {
  const a = await app();
  const list = JSON.parse(JSON.stringify(LIST));
  list.payments.push(pay('tx-fa', '2026-11-03', 100000, 'Finanzamt Charlottenburg', false, [], { noReceipt: true, noReceiptWhy: 'tax office' }));
  a.receipts.set('2026-11', list);
  a.receipts.mode('rc', 'private');
  const html = a.receipts.log();
  assert.match(html, /Finanzamt Charlottenburg[\s\S]*?Not needed[\s\S]*?tax office/);
  assert.match(html, /Missing<\/span><b class="bad">1<\/b>/, 'only LIDL is missing; the tax office is not');
});
