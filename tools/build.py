"""Build the phone app.

src/debt-slayer.html is the one source file. It also runs as a Claude artifact, where it keeps data in
Claude's database. This script turns it into index.html, the installable phone app that keeps data in the
browser, and stamps sw.js with a cache version so installed copies pick up the new build.

    python3 tools/build.py           write index.html and sw.js
    python3 tools/build.py --check   exit 1 if index.html or sw.js are out of date (CI runs this)
"""
import sys, pathlib, hashlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT, SW = ROOT / 'src' / 'debt-slayer.html', ROOT / 'index.html', ROOT / 'sw.js'
check = '--check' in sys.argv[1:]
h = SRC.read_text()

def rep(old, new, count=1):
    global h
    n = h.count(old)
    assert n == count, f'expected {count}x, found {n}: {old[:70]!r}'
    h = h.replace(old, new)

# ---- document shell: head metas for phones and home-screen install ----
rep('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
cut = h.index('</style>') + len('</style>')
head, body = h[:cut], h[cut:]
h = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Debt Slayer: a game-style money planner. Daily spending limit, bills, and a debt payoff plan.">
<meta name="theme-color" content="#F3EEFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#130D27" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Debt Slayer">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<script>try{{var t=localStorage.getItem('debtslayer.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}}catch(e){{}}</script>
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>:root{{color-scheme:light}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head}
</head>
<body>{body}
</body>
</html>
'''

# ---- CSS: no tap flash or text zoom on phones; small backup nudge ----
rep('.banner{font-size:12px;color:var(--muted);text-align:center;padding:14px 0 0}',
    '.banner{font-size:12px;color:var(--muted);text-align:center;padding:14px 0 0}\n'
    '.banner .linkbtn{background:none;border:0;padding:0;color:var(--ink);font-weight:600;text-decoration:underline;cursor:pointer}\n'
    '.nudge{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;border:2px dashed var(--edge);border-radius:var(--r);padding:12px 14px;background:var(--panel-2);font-size:14px}\n'
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}\nbutton,a,label{-webkit-tap-highlight-color:transparent}')

# ---- backups: this device is the only copy, so make saving one easy ----
rep("function save(promise, okMsg) {",
    """const BK = 'debtslayer.lastBackup';
function lastBackup() { try { return localStorage.getItem(BK) || null; } catch (e) { return null; } }
function markBackup() { try { localStorage.setItem(BK, isoOf(new Date())); } catch (e) {} }
const backupDue = () => { const lb = lastBackup(); return !lb || diffD(lb, T) >= 7; };
async function saveBackupFile() {
  const name = `debt-slayer-backup-${isoOf(new Date())}.json`;
  const file = new File([JSON.stringify(exportAll(), null, 1)], name, {type: 'application/json'});
  try {
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: 'Debt Slayer backup'}); markBackup(); toast('Backup saved'); scheduleRender(); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  markBackup(); toast('Backup saved'); scheduleRender();
}
function restoreBlock() {
  return `<label class="fld" for="r-file"><span>Restore from a backup file</span><input type="file" id="r-file" accept=".json,application/json,text/plain"><small>Pick the .json file you saved or AirDropped. It replaces matching entries on this device.</small></label>
      <label class="fld" for="s-import"><span>Or paste a backup</span><textarea id="s-import" placeholder="Paste a backup here"></textarea></label>
      <div class="formrow"><button type="button" class="btn" data-act="import">Restore</button></div>
      <p class="err" id="f-err" hidden></p>`;
}
function openRestore() {
  openSheet(sheetHead('Restore a backup') + `<div class="form">${restoreBlock()}</div>`);
}
function save(promise, okMsg) {""")

rep("""<div class="formrow"><button type="button" class="btn" data-act="copybackup">Copy backup</button></div>
      <label class="fld" for="s-import"><span>Restore from backup</span><textarea id="s-import" placeholder="Paste a backup here"></textarea></label>
      <div class="formrow"><button type="button" class="btn" data-act="import">Restore</button></div>
      <p class="err" id="f-err" hidden></p>""",
    """<div class="formrow"><button type="button" class="btn gold" data-act="savebackup">Save backup file</button><button type="button" class="btn" data-act="copybackup">Copy backup</button></div>
      <p class="small muted">${lastBackup() ? `Last backup ${esc(rel(lastBackup()))}.` : 'No backup saved on this device yet.'} Your data lives only on this device. Save a file to iCloud Drive or Files every week.</p>
      ${restoreBlock()}""")
rep("<small>Copy this somewhere safe. Paste a backup below to restore it.</small>", "<small>The same backup as text.</small>")

rep("""    try { navigator.clipboard.writeText(ta.value).then(() => { b.textContent = 'Copied'; }, fallback); } catch (e) { fallback(); }
  },""", """    try { navigator.clipboard.writeText(ta.value).then(() => { b.textContent = 'Copied'; markBackup(); }, fallback); } catch (e) { fallback(); }
  },
  savebackup: () => saveBackupFile(),
  restore: () => openRestore(),""")
rep("""    save(importAll(obj), 'Backup restored').then(closeSheet, e => fail(e.message || 'Restore failed.'));""",
    """    save(importAll(obj), 'Backup restored').then(() => { markBackup(); closeSheet(); }, e => fail(e.message || 'Restore failed.'));""")
rep("""  if (e.target.name === 'freq') {""",
    """  if (e.target.id === 'r-file' && e.target.files && e.target.files[0]) {
    e.target.files[0].text().then(t => { $('#s-import').value = t; ACTIONS.import(); }, () => fail('Could not read that file.'));
  }
  if (e.target.name === 'freq') {""")

# ---- first run: restore button next to "Start a blank board" ----
rep("""You can also paste a backup from Settings.</p><button class="btn gold" data-act="blank">${px('plus')} Start a blank board</button></div>`;""",
    """Moving from another device? Restore your backup file.</p><div class="row"><button class="btn gold" data-act="restore">${px('arrow')} Restore a backup</button><button class="btn" data-act="blank">${px('plus')} Start a blank board</button></div></div>`;""")
rep("Start a blank board, then add your income, bills and debts from the Bills tab.", "Start a blank board and add your income, bills and debts from the Bills tab.")

# ---- device-only banner and weekly backup nudge on HQ ----
rep("""main.innerHTML = html + (store.kind === 'local' ? `<p class="banner">Saved in this browser only.</p>` : '');""",
    """main.innerHTML = html + (store.kind === 'local' ? `<p class="banner">Saved on this device only. ${lastBackup() ? `Last backup ${esc(rel(lastBackup()))}.` : 'No backup yet.'} <button class="linkbtn" data-act="savebackup">Save a backup</button></p>` : '');""")
rep("""  return `<div class="hq"><div class="col">${greet()}""",
    """  const nudge = store.kind === 'local' && backupDue() && ITEMS.length ? `<div class="nudge"><span>${lastBackup() ? `Last backup ${esc(rel(lastBackup()))}.` : 'No backup yet.'} This phone is the only copy of your board.</span><button class="btn sm" data-act="savebackup">Save backup</button></div>` : '';
  return `<div class="hq"><div class="col">${nudge}${greet()}""")

# ---- offline + ask the browser to keep the data ----
rep("""  if (store.kind === 'local') window.__debtSlayer = {importAll, exportAll};""",
    """  if (store.kind === 'local') {
    window.__debtSlayer = {importAll, exportAll};
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e));
  }""")

# ---- service worker: a new cache version for every new build ----
version = 'ds-' + hashlib.sha256(h.encode()).hexdigest()[:10]
sw = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", SW.read_text(), count=1)
assert sw.count(version) == 1, 'sw.js has no VERSION line'

if check:
    stale = [p.name for p, new in ((OUT, h), (SW, sw)) if not p.exists() or p.read_text() != new]
    if stale:
        sys.exit(f"Out of date: {', '.join(stale)}. Run python3 tools/build.py and commit the result.")
    print('index.html and sw.js match src/debt-slayer.html')
    sys.exit(0)
OUT.write_text(h)
SW.write_text(sw)
print(f'wrote index.html ({len(h):,} bytes) and sw.js ({version})')
