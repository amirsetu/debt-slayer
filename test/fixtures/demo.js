// A made-up board for tests. Never put real money data in this folder: the repo is public.
export const TODAY = '2026-11-10';

export function settings(extra = {}) {
  return Object.assign({
    fx: 0.86, fee: 0.6, fxAuto: false, buffer: 100, living: 600, horizon: 28,
    syncDate: TODAY, syncAt: 0, syncs: [], created: '2026-01-01',
    balances: { wise: 0, wisep: 0, qonto: 1000, spk: 0, paypal: 0, klarna: 0 },
  }, extra);
}

const monthly = (name, amt, day, acct, extra = {}) =>
  Object.assign({ name, amt, cur: 'EUR', freq: 'monthly', start: `2026-01-${String(day).padStart(2, '0')}`, day, acct, cat: 'Other' }, extra);

export const ITEMS = {
  claude: monthly('Claude Business', 18, 10, 'qonto', { cat: 'Business tools' }),
  resend: monthly('Resend', 18.5, 8, 'wise', { cat: 'Business tools' }),
  rent: monthly('Rent', 900, 9, 'qonto', { cat: 'Home' }),
};

/** the docs a phone keeps under debtslayer.v1 */
export function board({ settings: s = settings(), items = {}, txns = {}, marks = { done: {}, ov: {} } } = {}) {
  const docs = { 'fin/settings': s, 'fin/marks': marks, 'fin/days': { d: {} } };
  for (const [id, it] of Object.entries(items)) docs['items/' + id] = it;
  for (const [id, t] of Object.entries(txns)) docs['txns/' + id] = t;
  return docs;
}

// what the sync service's /v1/feed hands the app (same shapes as debt-slayer-sync's mock provider)
export const ACCOUNTS = [
  { id: 'mock:qonto', provider: 'mock', name: 'Qonto · Main (demo)', currency: 'EUR', balance_cents: 21450 },
  { id: 'mock:wise:EUR', provider: 'mock', name: 'Wise · EUR (demo)', currency: 'EUR', balance_cents: 8912 },
];
const tx = (id, account_id, day, amount_cents, kind, counterparty, status = 'completed') =>
  ({ id: 'mock:' + id, provider: 'mock', account_id, amount_cents, currency: 'EUR', kind, counterparty, description: '', status, booked_at: day + 'T10:00:00Z' });

export const FEED = [
  tx('anthropic', 'mock:qonto', '2026-11-10', -1800, 'card', 'ANTHROPIC, PBC'),          // Claude Business, matched by name
  tx('resend', 'mock:wise:EUR', '2026-11-08', -1950, 'card', 'Resend'),                   // Resend, matched by name at a new price
  tx('rent', 'mock:qonto', '2026-11-10', -90000, 'transfer', 'Hausverwaltung Nord'),     // Rent, matched by exact amount, a day late
  tx('lidl', 'mock:wise:EUR', '2026-11-10', -2340, 'card', 'LIDL DIENSTL'),              // spending, logged as groceries
  tx('coffee', 'mock:wise:EUR', '2026-11-10', -650, 'card', 'Starbucks', 'pending'),     // spending, still pending
  tx('move-out', 'mock:wise:EUR', '2026-11-10', -5000, 'transfer', 'To Qonto'),          // a move between your accounts
  tx('move-in', 'mock:qonto', '2026-11-10', 5000, 'income', 'Wise Europe SA'),
  tx('own-in', 'mock:qonto', '2026-11-10', 10000, 'income', 'Demo Studio GmbH'),         // your own company paying you: not income
  tx('old', 'mock:wise:EUR', '2026-11-01', -1200, 'card', 'Some Shop'),                  // before live sync was connected
];
export const OWNERS = ['Demo Studio GmbH'];
