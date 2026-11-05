# Debt Slayer

A game-style money planner for irregular income and stacked payment plans. It shows how much you can spend today without missing a bill in the coming weeks, turns each debt into a boss with an HP bar, and plans the fastest way to pay them off.

**Open it:** https://amirsetu.github.io/debt-slayer/

## Put it on your phone

**iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
**Android (Chrome):** open the link, tap ⋮, then **Install app** (or **Add to Home screen**).

It then opens full screen like a normal app and works offline.

## Your data

- Everything you enter stays **on that device only**, in the browser's storage. Nothing is sent to a server, and this repository contains no personal data.
- Each device has its own board. To move your board, use **Settings → Save backup file** on one device and **Restore a backup** on the other.
- On iPhone, deleting the home-screen icon also deletes its data. Save a backup file to iCloud Drive or Files every week. The app reminds you when one is due.

## What's in here

| File | What it is |
|---|---|
| `index.html` | The whole app (HTML, CSS and JavaScript in one file) |
| `manifest.webmanifest` | Name, colours and icons for "Add to Home Screen" |
| `sw.js` | Service worker that keeps the app working offline |
| `icons/` | App icons |

No build step. Edit `index.html`, push, and GitHub Pages serves the new version. Installed copies pick it up the next time they open while online.
