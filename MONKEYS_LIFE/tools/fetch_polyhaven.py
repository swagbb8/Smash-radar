"""Download CC0 assets from Poly Haven (https://polyhaven.com, everything there is CC0) on a GitHub runner.

    python fetch_polyhaven.py catalog                 -> out/catalog.json  (ids, names, categories, tags for nature assets)
    python fetch_polyhaven.py get "id1 id2 ..." [1k]  -> out/<id>/...      (HDRI .hdr, texture maps, or a model as .blend + textures)
"""
import json, os, sys, urllib.request

API = 'https://api.polyhaven.com'; UA = {'User-Agent': 'MonkeysLife/1.0 (github.com/swagbb8/Smash-radar)'}
OUT = 'out'


def get(url, binary=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        data = r.read(); return data if binary else json.loads(data)


def save(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path): return
    with open(path, 'wb') as f: f.write(get(url, binary=True))
    print('  saved', path, os.path.getsize(path) // 1024, 'kB', flush=True)


def catalog():
    os.makedirs(OUT, exist_ok=True); out = {}
    want = ('plant', 'tree', 'fern', 'rock', 'log', 'stump', 'moss', 'jungle', 'tropical', 'mud', 'forest', 'root', 'leaf', 'leaves', 'grass', 'bush', 'shrub', 'swamp', 'vine', 'palm', 'nature', 'ground', 'bark', 'branch', 'stone', 'boulder', 'water', 'insect', 'beetle')
    for kind in ('hdris', 'textures', 'models'):
        for k, v in get(f'{API}/assets?t={kind}').items():
            words = ' '.join([k, v.get('name', '')] + v.get('categories', []) + v.get('tags', [])).lower()
            if any(w in words for w in want): out[k] = dict(type=kind, name=v.get('name'), categories=v.get('categories'), tags=v.get('tags'), polycount=v.get('polycount'), dimensions=v.get('dimensions'), download_count=v.get('download_count'))
    json.dump(out, open(os.path.join(OUT, 'catalog.json'), 'w'), indent=0); print(len(out), 'assets in the catalog')


def fetch(ids, res='1k'):
    report = {}
    default = res
    for i in ids:
        i, _, own = i.partition('@'); res = own or default                    # "id@4k" asks for one asset at its own size
        try:
            files = get(f'{API}/files/{i}'); print(i, list(files.keys())[:12], flush=True); d = os.path.join(OUT, i)
            if 'hdri' in files:
                r = res if res in files['hdri'] else sorted(files['hdri'])[0]; path = os.path.join(d, f'{i}.hdr')
                if own and os.path.exists(path): os.remove(path)               # asked for a different size than the one kept
                save(files['hdri'][r]['hdr']['url'], path); report[i] = 'hdri ' + r
            elif 'blend' in files:
                r = res if res in files['blend'] else sorted(files['blend'])[0]; b = files['blend'][r]['blend']; save(b['url'], os.path.join(d, f'{i}.blend'))
                for rel, inc in (b.get('include') or {}).items(): save(inc['url'], os.path.join(d, rel))
                report[i] = 'model ' + r
            else:
                got = []
                for m in ('Diffuse', 'nor_gl', 'Rough', 'Displacement', 'AO', 'arm'):
                    if m in files:
                        r = res if res in files[m] else sorted(files[m])[0]; fmt = 'jpg' if 'jpg' in files[m][r] else sorted(files[m][r])[0]; save(files[m][r][fmt]['url'], os.path.join(d, f'{i}_{m}.{fmt}')); got.append(m)
                report[i] = 'texture ' + ','.join(got)
        except Exception as e: report[i] = 'FAILED ' + str(e); print('  failed', i, e, flush=True)
    json.dump(report, open(os.path.join(OUT, 'report.json'), 'w'), indent=1); print(json.dumps(report, indent=1))


if __name__ == '__main__':
    if sys.argv[1] == 'catalog': catalog()
    else: fetch(sys.argv[2].split(), sys.argv[3] if len(sys.argv) > 3 else '1k')
