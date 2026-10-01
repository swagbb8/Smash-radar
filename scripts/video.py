"""Turn a voiced SMASH NEWS show into a saveable MP4: Smash the lion lip-syncing to his real voice,
with the headline bar, story picture and burned-in captions (the script) on screen.

Usage: python3 scripts/video.py <show.json> <audio_dir> <out.mp4>
Needs ffmpeg and Chrome/Chromium (Playwright drives the browser that draws each frame)."""
import asyncio, json, os, subprocess, sys, tempfile, wave, array, math, shutil, html, glob

W, H, FPS = 540, 960, 8
RATE = 24000          # edge-tts clips are 24 kHz mono
PAUSE = 0.35          # same gap the app uses between segments
MOUTH = 4             # mouth shapes: closed → wide open
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lion_svg():
    return subprocess.check_output(['node', '-e', "import('./public/lion.js').then(m => process.stdout.write(m.lionSVG()))"], cwd=ROOT, text=True)


def decode(path):
    """MP3 → 16-bit mono PCM samples."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(RATE), '-'], capture_output=True, check=True).stdout
    a = array.array('h'); a.frombytes(raw)
    return a


def chrome_path():
    for p in [os.environ.get('CHROME_PATH'), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']:
        if p and os.path.exists(p):
            return p
    hits = glob.glob('/opt/pw-browsers/chromium*/chrome-linux/chrome')
    return hits[0] if hits else None


PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%(W)dpx;height:%(H)dpx;overflow:hidden;background:#050607;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff}
#st{position:absolute;inset:0;background:radial-gradient(90%% 70%% at 50%% 35%%,#2b1d0e 0%%,#120d08 55%%,#050607 100%%)}
#st:before{content:'';position:absolute;inset:0;background:repeating-radial-gradient(circle at 50%% 38%%,rgba(255,190,90,.07) 0 2px,transparent 2px 46px)}
.top{position:absolute;top:18px;left:18px;right:18px;display:flex;align-items:center;gap:10px;z-index:3}
.live{background:#ff3d2e;color:#fff;font-weight:900;font-size:14px;letter-spacing:.1em;padding:5px 10px;border-radius:6px}
.brand{font-weight:900;font-size:22px;letter-spacing:.06em}.brand b{color:#c6ff3d}.brand small{font-size:12px;color:#aab;margin-left:4px}
.time{margin-left:auto;font-weight:800;font-size:18px;color:#cfd3d8}
.card{position:absolute;top:64px;left:24px;right:24px;border-radius:18px;overflow:hidden;background:rgba(10,13,17,.94);border:1px solid rgba(255,255,255,.12);z-index:3}
.card .m{height:190px;background:#151b23 center/cover no-repeat;display:grid;place-items:center;font-size:72px}
.card .t{padding:9px 14px 10px}.card .k{font-size:12px;font-weight:900;letter-spacing:.12em;color:#c6ff3d;text-transform:uppercase}
.card b{display:block;font-size:18px;line-height:1.22;margin-top:3px;max-height:44px;overflow:hidden}
.card small{display:block;margin-top:4px;font-size:13px;color:#8a929c}
.bump{position:absolute;top:70px;left:0;right:0;text-align:center;z-index:3}.bump span{font-size:70px;display:block}
.bump b{font-size:36px;font-weight:900;letter-spacing:.05em;display:block;margin-top:10px}.bump small{color:#c6ff3d;font-weight:900;letter-spacing:.3em;font-size:14px}
.lw{position:absolute;left:50%%;bottom:190px;width:340px;transform:translateX(-50%%);z-index:1}
.lw svg{width:100%%;height:auto;display:block;filter:drop-shadow(0 18px 30px rgba(0,0,0,.5))}
.desk{position:absolute;left:0;right:0;bottom:134px;height:58px;z-index:2;display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(180deg,#1a2230,#0b0f16);border-top:3px solid #c6ff3d;font-weight:900;font-size:26px;letter-spacing:.1em}.desk b{color:#c6ff3d}
.cc{position:absolute;left:14px;right:14px;bottom:204px;z-index:5;background:rgba(0,0,0,.82);border-radius:10px;padding:8px 12px;font-size:18px;line-height:1.35;max-height:108px;overflow:hidden}
.chy{position:absolute;left:0;right:0;bottom:38px;height:96px;z-index:4;background:linear-gradient(90deg,#f4f6f2,#dfe4dc);color:#0a0d11;border-top:4px solid #ff3d2e;padding:20px 18px 10px}
.sec{position:absolute;top:-17px;left:16px;background:#ff3d2e;color:#fff;font-size:13px;font-weight:900;letter-spacing:.12em;padding:4px 10px;border-radius:5px}
.hd{font-weight:900;font-size:21px;line-height:1.2;max-height:52px;overflow:hidden}
.tick{position:absolute;left:0;right:0;bottom:0;height:38px;z-index:4;background:#050607;display:flex;align-items:center;font-size:15px;white-space:nowrap;overflow:hidden}
.tick .l{background:#c6ff3d;color:#0b1100;font-weight:900;font-size:12px;letter-spacing:.12em;height:100%%;display:grid;place-items:center;padding:0 12px;flex:none}
.tick .r{padding-left:14px;color:#e9ecef}.tick .r b{color:#c6ff3d;font-size:12px;letter-spacing:.08em;margin-right:6px}
.prog{position:absolute;left:0;bottom:189px;height:4px;background:#c6ff3d;z-index:5}
.cc2{bottom:146px}
</style></head><body><div id="st">
<div class="top"><span class="live">● LIVE</span><span class="brand"><b>SMASH</b> NEWS<small>24/7</small></span><span class="time" id="tm"></span></div>
<div id="mid"></div>
<div class="lw">%(LION)s</div>
<div class="desk"><b>SMASH</b>&nbsp;NEWS</div>
<div class="cc" id="cc"></div>
<div class="chy"><span class="sec" id="sec"></span><div class="hd" id="hd"></div></div>
<div class="prog" id="pg"></div>
<div class="tick"><span class="l">LATEST</span><span class="r" id="tk"></span></div>
</div><script>
window.setSeg = (s) => {
  document.getElementById('tm').textContent = s.time;
  document.getElementById('sec').textContent = s.section;
  document.getElementById('hd').textContent = s.head;
  document.getElementById('cc').textContent = s.text;
  document.getElementById('tk').innerHTML = s.ticker;
  document.getElementById('pg').style.width = s.progress + '%%';
  const mid = document.getElementById('mid');
  if (s.bumper) mid.innerHTML = '<div class="bump"><span>' + s.icon + '</span><b>' + s.section + '</b><small>SMASH NEWS</small></div>';
  else if (s.title) mid.innerHTML = '<div class="card"><div class="m" style="' + (s.image ? 'background-image:url(' + JSON.stringify(s.image) + ')' : '') + '">' + (s.image ? '' : s.icon) + '</div><div class="t"><span class="k">' + s.kicker + '</span><b>' + s.title + '</b><small>' + s.source + '</small></div></div>';
  else mid.innerHTML = '';
  const imgs = [...document.querySelectorAll('.card .m')].map((d) => d.style.backgroundImage.match(/url\\("?(.*?)"?\\)/)?.[1]).filter(Boolean);
  return Promise.race([Promise.all(imgs.map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; }))), new Promise((r) => setTimeout(r, 4000))]);
};
window.setMouth = (lv) => {
  const svg = document.querySelector('.lw svg');
  const open = 3 + lv * 24;
  const jaw = svg.querySelector('.ln-jaw'), tg = svg.querySelector('.ln-tongue');
  jaw.setAttribute('ry', open.toFixed(1)); jaw.setAttribute('cy', (8 + open * 0.5).toFixed(1));
  tg.setAttribute('ry', Math.max(0, open - 10).toFixed(1)); tg.setAttribute('cy', (12 + open * 0.8).toFixed(1));
  svg.querySelector('.ln-smile').style.opacity = lv > 0.08 ? '0' : '1';
  svg.querySelectorAll('.ln-brow').forEach((b, k) => b.setAttribute('transform', 'translate(0 ' + (-lv * 5 * (k ? 1 : 0.8)).toFixed(1) + ')'));
  svg.querySelector('.ln-head').setAttribute('transform', 'translate(0 ' + (-lv * 3).toFixed(1) + ')');
};
</script></body></html>"""

ICON = {'news': '📰', 'dupage': '📍', 'deals': '💰', 'food': '🍔', 'energy': '⚡', 'tech': '📱', 'gaming': '🎮', 'auto': '🚗', 'clothing': '👟', 'nfl': '🏈'}


async def render_frames(show, tmp):
    from playwright.async_api import async_playwright
    segs = show['segments']
    seen, tick = set(), []
    for g in segs:
        if g.get('title') and g['title'] not in seen:
            seen.add(g['title']); tick.append(f"<b>{html.escape(g.get('section', ''))}</b>{html.escape(g['title'])}")
    ticker = '&nbsp;&nbsp;◆&nbsp;&nbsp;'.join(tick[:3])
    from datetime import datetime
    from zoneinfo import ZoneInfo
    start = datetime.fromisoformat((show.get('startsAt') or show['createdAt']).replace('Z', '+00:00')).astimezone(ZoneInfo('America/Chicago'))
    total = show['totalSeconds'] or 1
    async with async_playwright() as p:
        kw = {'args': ['--no-sandbox']}
        cp = chrome_path()
        if cp: kw['executable_path'] = cp
        b = await p.chromium.launch(**kw)
        pg = await b.new_page(viewport={'width': W, 'height': H})
        await pg.set_content(PAGE % {'W': W, 'H': H, 'LION': lion_svg()})
        for i, g in enumerate(segs):
            img = g.get('imageUrl')
            if img: img = 'https://wsrv.nl/?url=' + __import__('urllib.parse').parse.quote(img, safe='') + '&w=600&h=400&fit=cover&output=jpg'
            await pg.evaluate('(s) => window.setSeg(s)', {
                'time': start.strftime('%-I:%M %p'), 'section': html.escape(g.get('section') or 'SMASH NEWS'),
                'head': g.get('title') or ('Smash the lion is on air' if g['kind'] == 'intro' else g.get('section') or ''),
                'text': g['text'], 'ticker': ticker, 'progress': round(100 * g.get('start', 0) / total, 2),
                'bumper': g['kind'] == 'bumper' and bool(g.get('icon')), 'icon': g.get('icon') or ICON.get(g.get('category'), '📰'),
                'title': html.escape(g.get('title') or ''), 'image': img, 'source': html.escape(g.get('source') or ''),
                'kicker': html.escape(' · '.join(x for x in [g.get('section'), g.get('place')] if x)),
            })
            for m in range(MOUTH):
                await pg.evaluate('(lv) => window.setMouth(lv)', m / (MOUTH - 1))
                await pg.screenshot(path=os.path.join(tmp, f's{i:04d}m{m}.jpg'), type='jpeg', quality=82)
        await b.close()


def build(show_path, audio_dir, out):
    show = json.load(open(show_path))
    segs = show['segments']
    tmp = tempfile.mkdtemp(prefix='smashvid-')
    try:
        # 1) audio: every clip + the same short pause the app uses; mouth level from loudness (real lip sync)
        pcm = array.array('h')
        frames = []  # (segment index, mouth shape) per video frame
        step = RATE // FPS
        for i, g in enumerate(segs):
            clip = os.path.join(audio_dir, os.path.basename(g['audio'])) if g.get('audio') else None
            a = decode(clip) if clip and os.path.exists(clip) else array.array('h', [0] * int(RATE * max(2.0, g.get('dur', 3))))
            a.extend([0] * int(RATE * PAUSE))
            for k in range(0, len(a) - step + 1, step):
                w = a[k:k + step]
                rms = math.sqrt(sum(x * x for x in w[::4]) / max(1, len(w[::4]))) / 32768
                lv = min(1.0, rms * 5.5)
                frames.append((i, 0 if lv < 0.06 else 1 if lv < 0.3 else 2 if lv < 0.6 else 3))
            pcm.extend(a[:len(a) - len(a) % step])
        with wave.open(os.path.join(tmp, 'a.wav'), 'wb') as wv:
            wv.setnchannels(1); wv.setsampwidth(2); wv.setframerate(RATE); wv.writeframes(pcm.tobytes())
        # 2) pictures: 4 mouth shapes per segment
        asyncio.run(render_frames(show, tmp))
        # 3) frame list → MP4
        with open(os.path.join(tmp, 'list.txt'), 'w') as f:
            prev, n = None, 0
            def flush():
                if prev: f.write(f"file 's{prev[0]:04d}m{prev[1]}.jpg'\nduration {n / FPS:.4f}\n")
            for fr in frames:
                if fr == prev: n += 1; continue
                flush(); prev, n = fr, 1
            flush()
            if prev: f.write(f"file 's{prev[0]:04d}m{prev[1]}.jpg'\n")
        tmp_out = out + '.part.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(tmp, 'list.txt'), '-i', os.path.join(tmp, 'a.wav'),
                        '-vf', f'fps={FPS},format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'animation', '-crf', '30',
                        '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', tmp_out], check=True)
        os.replace(tmp_out, out)
        print(f"video: {out} ({os.path.getsize(out) / 1e6:.1f} MB, {len(frames) / FPS / 60:.1f} min)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3])
