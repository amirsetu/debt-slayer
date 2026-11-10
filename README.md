# Debt Slayer

A game-style money planner for irregular income and stacked payment plans. It shows how much you can spend today without missing a bill in the coming weeks, turns each debt into a boss with an HP bar, and plans the fastest way to pay them off.

**Open it:** https://amirsetu.github.io/debt-slayer/

## Put it on your phone

**iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
**Android (Chrome):** open the link, tap ⋮, then **Install app** (or **Add to Home screen**).

It then opens full screen like a normal app and works offline.

## Your data

- Everything you enter is kept **on the device**, in the browser's storage. This repository contains no personal data.
- **Cloud backup** (Settings, after connecting your sync service): the board is locked on the device with a passphrase you choose (PBKDF2 + AES-GCM), then kept by your own sync service. Nobody else can open it. Every device with the passphrase loads the newest board when it opens; if two devices both changed it, the app asks which one to keep. **Earlier backups** goes back a month.
- **Notifications** (Settings, after connecting your sync service): money in and out on your connected accounts, bills due or not gone out, and banks that stop syncing. They're encrypted for each device. For bill reminders, the next two weeks of bills (name, amount, date) go to your sync service.
- **Sparkasse** (Settings › Live bank sync, once your sync service has Enable Banking set up): pick your Sparkasse, log in on its page with S-pushTAN, and it syncs like the other banks.
- **Pull down to refresh:** at the top of any screen, pull down and let go (or hold a moment) to sync with your banks and your other devices.
- **Repeating charges** (Bills tab, with live sync): subscriptions and plans your bank shows coming back, offered as bills in one tap.
- **Receipts** (History › Receipts, once your sync service has Gmail set up): invoices from your Gmail inboxes land on the bank payment they belong to; business or private per account or per payment; add a photo or PDF for the rest, or mark a payment as needing none. **Export** a month, quarter or year as one ZIP with every file and a spreadsheet, for your tax return. Receipts and the archived emails are kept by your own sync service.
- **First run:** "Set up a new board" walks through name and cushion, accounts and balances, pay, and common bills.
- New device: open the app, tap **From cloud backup**, and enter the sync address, app key and passphrase.
- Without cloud backup, use **Settings → Save backup file** and **Restore a backup**. On iPhone, deleting the home-screen icon also deletes its data, so save a file every week; the app reminds you.

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
| `test/` | Engine tests: the daily limit, live bank matching, cloud backup, reminders, repeating charges, setup and the streak |
