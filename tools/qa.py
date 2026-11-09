"""A QA copy of the phone app in qa/ (git ignores it), for clicking through in a browser.

    python3 tools/build.py && python3 tools/qa.py [--seed board.json]
    python3 -m http.server 8766 -d qa        then open http://localhost:8766/?today=2026-11-10

- ?today=YYYY-MM-DD makes the app think it is that day.
- window.__qa in the browser console is the same engine API the tests use (compute, occ, applyFeed, ...).
- --seed loads a backup file (Settings -> Save backup file) into an empty browser. Keep real backups out of the repo.
- Port 8766 is allowed by the sync service's CORS list, so live sync and cloud backup work against `npm run dev` there.
"""
import sys, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
args = sys.argv[1:]
seed = pathlib.Path(args[args.index('--seed') + 1]) if '--seed' in args else None

today = """<script>(function(){var q=new URLSearchParams(location.search).get('today');if(!q)return;var p=q.split('-').map(Number);var R=Date;var off=new R(p[0],p[1]-1,p[2],12,0,0)-R.now();function F(){var a=[].slice.call(arguments);return a.length?new (Function.prototype.bind.apply(R,[null].concat(a)))():new R(R.now()+off);}F.now=function(){return R.now()+off};F.UTC=R.UTC;F.parse=R.parse;F.prototype=R.prototype;window.Date=F;})();window.__dsQA=true;</script>"""
if seed:
    b = json.loads(seed.read_text())
    docs = {'fin/settings': b['settings'], 'fin/marks': b.get('marks') or {'done': {}, 'ov': {}}, 'fin/days': b.get('days') or {'d': {}}}
    docs.update({'items/' + k: v for k, v in (b.get('items') or {}).items()})
    docs.update({'txns/' + k: v for k, v in (b.get('txns') or {}).items()})
    if b.get('live'): docs['fin/live'] = b['live']
    today += "<script>try{if(!localStorage.getItem('debtslayer.v1'))localStorage.setItem('debtslayer.v1'," + json.dumps(json.dumps(docs)) + ")}catch(e){}</script>"

page = (ROOT / 'index.html').read_text()
assert page.count('<link rel="manifest"') == 1
page = page.replace('<link rel="manifest"', today + '\n<link rel="manifest"', 1)
out = ROOT / 'qa'
out.mkdir(exist_ok=True)
(out / 'index.html').write_text(page)
print('wrote qa/index.html' + (f' with the board from {seed.name}' if seed else ''))
