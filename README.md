# Debt Slayer

A game-style money planner for irregular income and stacked payment plans. It shows how much you can spend today without missing a bill in the coming weeks, turns each debt into a boss with an HP bar, and plans the fastest way to pay them off.

**Open it:** https://amirsetu.github.io/debt-slayer/

## Put it on your phone

**iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
**Android (Chrome):** open the link, tap ⋮, then **Install app** (or **Add to Home screen**).

It then opens full screen like a normal app and works offline.

## Your data

- Everything you enter stays **on that device**, in the browser's storage. This repository contains no personal data.
- To move your board, use **Settings → Save backup file** on one device and **Restore a backup** on the other.
- On iPhone, deleting the home-screen icon also deletes its data. Save a backup file to iCloud Drive or Files every week. The app reminds you when one is due.

## Working on it

`src/debt-slayer.html` is the only source file. It also runs as a Claude artifact. The phone app (`index.html`) is built from it.

```bash
npm test          # run the engine tests in Node (no browser needed)
npm run build     # write index.html and stamp sw.js with a new cache version
npm run check     # fail if index.html or sw.js are out of date (CI runs this and the tests on every push)
npm run qa        # build a QA copy in qa/ and serve it at http://localhost:8766/?today=2026-11-10
```

Change `src/debt-slayer.html`, run `npm test` and `npm run build`, then commit `src/`, `index.html` and `sw.js` together. GitHub Pages serves the new version, and installed copies pick it up the next time they open while online.

The tests load the real app script in Node with no page (`test/harness.js`) and drive it through the `API` object at the end of the source file. They use a made-up board in `test/fixtures/`; never put real money data there.

## What's in here

| Path | What it is |
|---|---|
| `src/debt-slayer.html` | The app source: HTML, CSS and JavaScript in one file |
| `index.html` | The built phone app (do not edit by hand) |
| `sw.js` | Service worker that keeps the app working offline |
| `manifest.webmanifest` | Name, colours and icons for "Add to Home Screen" |
| `icons/` | App icons, drawn by `tools/make_icons.py` |
| `tools/build.py` | Builds `index.html` and `sw.js` from the source |
| `tools/qa.py` | A QA copy with a date override and the engine on `window.__qa` |
| `test/` | Engine tests: the daily limit and live bank matching |
