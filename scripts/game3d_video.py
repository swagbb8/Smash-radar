"""SMASH NEWS 3D cartoon replay of an NFL game: every scoring play acted out by cartoon players on a 3D field
(three.js), built from the real play-by-play, with scoreboard, captions, fantasy points and an original beat.
Usage: python3 scripts/game3d_video.py <nfl.json> <gameId> <out.mp4> [recaps.json]
Data: ESPN summary (all scoring plays + real jersey numbers) -> this week's nfl.json -> the saved recap record (old games)."""
import asyncio, json, math, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recap_video as rv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, FPS = 720, 1280, 20
QN = ['', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT']


def parse_play(p):
    t = re.sub(r'\s*\((?:[^()]|\([^()]*\))*\)\s*$', '', p.get('text', '')).strip()
    m = re.match(r'^(.+?) (\d+) Yd pass from (.+)$', t, re.I)
    if m: return 'pass', int(m.group(2)), f"{m.group(1)} {m.group(2)}-yd TD catch", m.group(1), m.group(3).strip(), 'TOUCHDOWN'
    m = re.match(r'^(.+?) (\d+) Yd Field Goal', t, re.I)
    if m: return 'fg', int(m.group(2)), f"{m.group(1)} {m.group(2)}-yd field goal", m.group(1), None, 'FIELD GOAL'
    m = re.match(r'^(.+?) (\d+) Yd (?:Interception|Fumble|Punt|Kickoff|Blocked \w+) Return', t, re.I)
    if m: return 'run', int(m.group(2)), f"{m.group(1)} {m.group(2)}-yd return TD", m.group(1), None, 'RETURN TD'
    m = re.match(r'^(.+?) (\d+) Yd (?:Run|Rush)', t, re.I)
    if m: return 'run', int(m.group(2)), f"{m.group(1)} {m.group(2)}-yd TD run", m.group(1), None, 'TOUCHDOWN'
    return 'run', 5, t[:60], None, None, 'SCORE'


def load(nfl_path, gid, recs_path=None):
    """Best source first: ESPN summary (all plays, jerseys), then this week's nfl.json, then the saved recap record."""
    tmp = tempfile.mktemp(suffix='.json')
    try:
        subprocess.run(['node', 'scripts/game3d-data.mjs', str(gid), tmp], cwd=ROOT, check=True, timeout=90)
        d = json.load(open(tmp))
        if d.get('plays'): return d['game'], d['plays'], d.get('jerseys') or {}
    except Exception as e: print(f'3d data: summary unavailable ({e}), falling back', file=sys.stderr)
    try:
        g = next(x for x in json.load(open(nfl_path))['games'] if str(x['id']) == str(gid))
        if g.get('plays'): return {'away': dict(g['away']), 'home': dict(g['home']), 'week': g.get('week'), 'fantasy': g.get('fantasy')}, g['plays'], g.get('jerseys') or {}
    except Exception: pass
    r = next(x for x in json.load(open(recs_path)) if str(x['id']) == str(gid))
    return {'away': dict(r['away']), 'home': dict(r['home']), 'week': r.get('week'), 'fantasy': None}, r.get('plays') or [], {}


def build(nfl_path, gid, out, recs_path=None):
    game, gplays, jerseys = load(nfl_path, gid, recs_path)
    if not gplays: raise SystemExit(f'game {gid}: no scoring plays')
    for k in ('away', 'home'):
        game[k]['color'] = game[k].get('color') or ('#1f6feb' if k == 'home' else '#d93025')
        game[k]['alt'] = game[k].get('alt') or '#ffffff'
    plays, tl, t = [], [{'kind': 'intro', 'start': 0, 'dur': 3.2}], 3.2
    jn = lambda name: (jerseys.get(name) or {}).get('n') if name else None
    for i, p in enumerate(gplays):
        kind, yd, headline, who, passer, label = parse_play(p)
        side = 'home' if p.get('team') == game['home']['abbr'] else 'away'
        if kind == 'pass':  # snap at 1.3s, throw 1.4s later, then the flight, run after the catch, 2.4s celebration
            flight = min(1.5, max(0.6, yd / 26)); cx = min(56, 52 + yd * 0.12) if yd <= 16 else min(47, (50 - yd) + yd * 0.72)
            dur = 1.3 + 1.4 + flight + max(0.6, (max(cx, 53) - cx) / 7) + 2.4
        elif kind == 'fg':
            flight = min(2.2, max(1.0, yd / 22)); dur = 1.3 + 1.0 + flight + 2.4
        else:
            dur = 1.3 + 0.6 + 0.5 + max(1.0, (yd + 3) / 8.5) + 2.4
        det = p.get('detail') or {}
        qb_run = kind == 'run' and label == 'TOUCHDOWN' and (jerseys.get(who) or {}).get('pos') == 'QB'
        plays.append({'_i': len(plays), 'kind': kind, 'det': {k: det.get(k) for k in ('shotgun', 'dir', 'depth', 'gap', 'toEndzone', 'ddText', 'scramble')}, 'qbRun': qb_run, 'yards': yd, 'side': side, 'headline': headline.upper(), 'label': label,
                      'q': QN[p.get('period') or 0], 'clock': p.get('clock', ''), 'away': p.get('away'), 'home': p.get('home'),
                      'num': jn(who), 'qbNum': jn(passer), 'fp': [{'player': (f"{p['team']} D/ST" if f['player'] == 'D/ST' else f['player']), 'pts': f['pts']} for f in (p.get('fantasy') or [])], 'dur': round(dur, 2)})
        tl.append({'kind': 'play', 'i': len(plays) - 1, 'start': round(t, 2), 'dur': round(dur, 2)}); t += dur
    tl.append({'kind': 'outro', 'start': round(t, 2), 'dur': 4.0}); total = t + 4.0
    tmp = tempfile.mkdtemp(prefix='g3d-')
    hits = [(0.4, 'impact')] + [(s['start'], 'whoosh') for s in tl[1:]] + [(s['start'] + s['dur'] - 2.2, 'impact') for s in tl if s['kind'] == 'play']
    rv.write_wav(os.path.join(tmp, 'm.wav'), rv.synth_music(total, hits))
    vid = os.path.join(tmp, 'v.mp4')
    page = open(os.path.join(ROOT, 'scripts', 'game3d.html')).read().replace('/*FONTS*/', rv.font_css())

    async def render():
        from playwright.async_api import async_playwright
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', vid], stdin=subprocess.PIPE)
        async with async_playwright() as p:
            kw = {'args': ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}
            cp = rv.chrome_path()
            if cp: kw['executable_path'] = cp
            b = await p.chromium.launch(**kw); pg = await b.new_page(viewport={'width': W, 'height': H})
            vendor = os.path.join(ROOT, 'assets', 'vendor')
            async def serve(route):
                rel = route.request.url.split('smash.local/', 1)[1].split('#')[0]
                if rel == 'game3d.html': return await route.fulfill(body=page, content_type='text/html')
                f = os.path.realpath(os.path.join(vendor, rel))
                if not f.startswith(vendor) or not os.path.isfile(f): return await route.fulfill(status=404, body='')
                await route.fulfill(body=open(f, 'rb').read(), content_type='text/javascript' if f.endswith('.js') else 'model/gltf-binary')
            await pg.route('http://smash.local/**', serve)
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://smash.local/game3d.html')
            await pg.wait_for_function('window.ready === true', timeout=60000)
            await pg.evaluate('async (d) => { await window.setup(d); }', {'game': game, 'plays': plays, 'timeline': tl})
            shots = [float(x) for x in os.environ.get('G3D_SHOTS', '').split(',') if x]  # debug: only grab these moments
            if os.environ.get('G3D_CAM'): await pg.evaluate('(c) => { window.CAM = c }', json.loads(os.environ['G3D_CAM']))
            for i in range(int(total * FPS)):
                want = not shots or any(abs(i / FPS - x) < 0.5 / FPS for x in shots)
                await pg.evaluate('([t, d]) => window.frame(t, d)', [i / FPS, want])
                if shots:
                    if want and os.environ.get('G3D_DBG'): print(i / FPS, await pg.evaluate('window._dbg()'))
                    if any(abs(i / FPS - x) < 0.5 / FPS for x in shots): await pg.screenshot(path=os.path.join(os.environ['G3D_SHOTDIR'], f'shot_{i / FPS:06.2f}.jpg'), type='jpeg', quality=85)
                    if i / FPS > max(shots): break
                    continue
                ff.stdin.write(await pg.screenshot(type='jpeg', quality=88))
            if errs: print('page errors:', errs[:3], file=sys.stderr)
            await b.close()
        ff.stdin.close(); ff.wait()
    asyncio.run(render())
    if os.environ.get('G3D_SHOTS'): print('timeline', json.dumps([(x['kind'], round(x['start'], 2), x['dur']) for x in tl])); return
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', vid, '-i', os.path.join(tmp, 'm.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out + '.part.mp4'], check=True)
    os.replace(out + '.part.mp4', out)
    print(f'3d replay: {out} ({os.path.getsize(out) / 1e6:.1f} MB, {total:.0f}s, {len(plays)} plays)')


if __name__ == '__main__':
    build(*sys.argv[1:5])
