// Runs src/debt-slayer.html's script in Node with no page, and hands back its engine (the API object at the end of the file).
// Every call to load() starts from a fresh, empty browser: its own localStorage, no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC = fileURLToPath(new URL('../src/debt-slayer.html', import.meta.url));
const html = readFileSync(SRC, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = new vm.Script(scripts[scripts.length - 1], { filename: 'src/debt-slayer.html' });

// a stand-in for the page: every property and call answers with itself, so drawing code runs and does nothing
function nothing() {
  const f = function () {};
  const p = new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === Symbol.iterator ? [][Symbol.iterator].bind([]) : p),
    set: () => true,
    deleteProperty: () => true,
    apply: () => p,
    construct: () => p,
  });
  return p;
}

function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    dump: () => Object.fromEntries(m),
  };
}

/**
 * @param {object} opt
 * @param {string} opt.today            the date the app thinks it is, YYYY-MM-DD
 * @param {object} [opt.board]           docs to start with, as the phone keeps them ({'fin/settings': {...}, 'items/rent': {...}})
 * @param {object} [opt.storage]         other localStorage keys
 * @param {Function} [opt.fetch]         stands in for the network
 */
export async function load({ today, board = {}, storage = {}, fetch } = {}) {
  const localStorage = memoryStorage(Object.assign({ 'debtslayer.v1': JSON.stringify(board) }, storage));
  let api = null;
  const window = {
    __dsTest: a => { api = a; },
    localStorage,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    navigator: { userAgent: 'node-test', storage: {} },
    location: { hash: '', protocol: 'http:', hostname: 'localhost', search: '' },
    history: { replaceState() {} },
    scrollTo() {},
    fetch: fetch || (async () => { throw new Error('no network in tests'); }),
    document: nothing(),
    console,
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    CompressionStream, DecompressionStream, Blob, Response,
    URL, URLSearchParams,
  };
  window.window = window;
  window.self = window;
  const ctx = vm.createContext(window);
  code.runInContext(ctx);
  if (!api) throw new Error('the app did not hand over its test API');
  if (today) api.setToday(today);
  api.useLocalStore();
  await tick();
  return Object.assign(api, { localStorage, tick });
}

export const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));

// objects made inside the app belong to another realm; this turns them into plain ones for assert.deepStrictEqual
export const plain = o => JSON.parse(JSON.stringify(o));
