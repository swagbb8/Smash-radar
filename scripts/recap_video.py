"""SMASH NEWS NFL recap video: a broadcast-style, motion-graphics game recap with Smash's voice-over and an
original synthesized music bed. Every frame is drawn from game data (score, scoring plays, leaders, team stats);
no NFL footage is used.

Usage: python3 scripts/recap_video.py <spec.json> <out.mp4>
Needs: ffmpeg, Chrome/Chromium + playwright (python), numpy, edge-tts (optional; silent narration without it)."""
import asyncio, base64, glob, json, math, os, subprocess, sys, tempfile, urllib.request, wave

import numpy as np

W, H, FPS = 720, 1280, 30
SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.environ.get('LION_VOICE', 'en-US-BrianMultilingualNeural')


# ---------------------------------------------------------------- voice
async def tts_all(lines, tmp):
    try:
        import edge_tts
    except Exception:
        return [None] * len(lines)
    out = []
    for i, ln in enumerate(lines):
        dest = os.path.join(tmp, f'v{i}.mp3')
        ok = False
        for _ in range(3):
            try:
                await edge_tts.Communicate(ln['text'], VOICE, rate='+12%', pitch='+3Hz', volume='+10%').save(dest)
                ok = os.path.getsize(dest) > 1000
                if ok: break
            except Exception as e:
                print(f'recap voice {i}: {e}', file=sys.stderr)
                await asyncio.sleep(1.5)
        out.append(dest if ok else None)
    return out


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


# ---------------------------------------------------------------- music (original, synthesized)
def synth_music(total, hits, bpm=118):
    n = int(total * SR) + SR
    t = np.arange(n) / SR
    mix = np.zeros(n, np.float32)
    beat = 60 / bpm
    rng = np.random.default_rng(7)

    def add(sig, at, gain=1.0):
        i = int(at * SR)
        if i >= n: return
        sig = sig[: n - i]
        mix[i:i + len(sig)] += sig * gain

    # drums
    kl = int(0.32 * SR); kt = np.arange(kl) / SR
    kick = np.sin(2 * np.pi * np.cumsum(45 + 110 * np.exp(-kt * 28)) / SR) * np.exp(-kt * 9)
    sl = int(0.22 * SR); st = np.arange(sl) / SR
    snare_noise = rng.standard_normal(sl)
    snare = (np.diff(snare_noise, prepend=0) * 0.6 + np.sin(2 * np.pi * 190 * st) * 0.5) * np.exp(-st * 18)
    hl = int(0.05 * SR); ht = np.arange(hl) / SR
    hat = np.diff(rng.standard_normal(hl), prepend=0) * np.exp(-ht * 70)
    start = 1.6  # beat drops when the matchup hits
    k = 0
    while start + k * beat < total:
        at = start + k * beat
        add(kick, at, 0.9)
        if k % 2 == 1: add(snare, at, 0.45)
        add(hat, at + beat / 2, 0.18); add(hat, at, 0.1)
        k += 1
    # bass: A minor-ish progression, 8th-note pulses
    roots = [55.0, 43.65, 65.41, 49.0]
    bar = beat * 4
    b = 0
    while start + b * bar < total:
        f = roots[b % 4]
        for e in range(8):
            at = start + b * bar + e * beat / 2
            ln = int(beat / 2 * SR * 0.9); bt = np.arange(ln) / SR
            saw = sum(np.sin(2 * np.pi * f * h * bt) / h for h in range(1, 6))
            add(saw * np.exp(-bt * 6) * 0.9, at, 0.22)
        # pad chord
        ln = int(bar * SR); pt = np.arange(ln) / SR
        env = np.minimum(1, pt / 0.4) * np.minimum(1, (bar - pt) / 0.4)
        pad = sum(np.sin(2 * np.pi * f * 4 * r * pt) for r in (1, 1.189, 1.498)) * env
        add(pad, start + b * bar, 0.035)
        b += 1
    # riser into the slam + impacts/whooshes on every scene change
    rl = int(1.2 * SR); rt = np.arange(rl) / SR
    riser = rng.standard_normal(rl) * (rt / 1.2) ** 2 * 0.25 + np.sin(2 * np.pi * np.cumsum(200 + 1200 * (rt / 1.2) ** 2) / SR) * (rt / 1.2) * 0.12
    add(riser, 0.0)
    il = int(1.4 * SR); it = np.arange(il) / SR
    impact = (np.sin(2 * np.pi * np.cumsum(30 + 80 * np.exp(-it * 6)) / SR) * np.exp(-it * 3) + rng.standard_normal(il) * np.exp(-it * 14) * 0.5)
    wl = int(0.45 * SR); wt = np.arange(wl) / SR
    wn = rng.standard_normal(wl)
    whoosh = np.convolve(wn, np.ones(12) / 12, 'same') * np.sin(np.pi * wt / 0.45) ** 2
    for at, kind in hits:
        if kind == 'impact': add(impact, at, 0.8)
        else: add(whoosh, max(0, at - 0.15), 0.55)
    mix /= max(1e-6, np.abs(mix).max())
    fade = np.minimum(1, np.minimum(t / 0.05, np.maximum(0, total + 0.5 - t) / 1.5))
    return (mix * fade * 0.8).astype(np.float32)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- frames
def data_uri(url):
    if not url: return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        b = urllib.request.urlopen(req, timeout=15).read()
        return 'data:image/png;base64,' + base64.b64encode(b).decode()
    except Exception:
        return None


def font_css():
    f = lambda n: base64.b64encode(open(os.path.join(ROOT, 'assets', 'fonts', n), 'rb').read()).decode()
    return (f"@font-face{{font-family:Anton;src:url(data:font/woff2;base64,{f('anton.woff2')}) format('woff2')}}"
            f"@font-face{{font-family:Oswald;font-weight:500;src:url(data:font/woff2;base64,{f('oswald-500.woff2')}) format('woff2')}}"
            f"@font-face{{font-family:Oswald;font-weight:700;src:url(data:font/woff2;base64,{f('oswald-700.woff2')}) format('woff2')}}")


def chrome_path():
    for p in [os.environ.get('CHROME_PATH'), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']:
        if p and os.path.exists(p): return p
    hits = glob.glob('/opt/pw-browsers/chromium*/chrome-linux/chrome')
    return hits[0] if hits else None


PAGE = open(os.path.join(ROOT, 'scripts', 'recap_frame.html'), encoding='utf-8').read()


async def render(spec, scenes, out_video_only):
    from playwright.async_api import async_playwright
    total = scenes[-1]['start'] + scenes[-1]['dur']
    frames = int(math.ceil(total * FPS))
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', str(FPS), out_video_only], stdin=subprocess.PIPE)
    async with async_playwright() as p:
        kw = {'args': ['--no-sandbox', '--font-render-hinting=none']}
        cp = chrome_path()
        if cp: kw['executable_path'] = cp
        b = await p.chromium.launch(**kw)
        pg = await b.new_page(viewport={'width': W, 'height': H})
        await pg.set_content(PAGE.replace('/*FONTS*/', font_css()))
        await pg.evaluate('(d) => window.setup(d)', {'spec': spec, 'scenes': scenes})
        await pg.evaluate('document.fonts.ready.then(() => true)')
        for f in range(frames):
            await pg.evaluate('(t) => window.frame(t)', f / FPS)
            ff.stdin.write(await pg.screenshot(type='jpeg', quality=90))
        await b.close()
    ff.stdin.close(); ff.wait()
    return total


def build(spec_path, out):
    spec = json.load(open(spec_path))
    tmp = tempfile.mkdtemp(prefix='recap-')
    # logos embedded so every frame paints instantly
    for side in ('away', 'home'):
        spec[side]['logoData'] = data_uri(spec[side].get('logo'))
    lines = spec['voice']
    clips = asyncio.run(tts_all(lines, tmp))
    voice_by_scene = {}
    for ln, c in zip(lines, clips):
        a = decode(c) if c else None
        dur = (len(a) / SR) if a is not None else max(2.0, len(ln['text'].split()) / 2.7)
        voice_by_scene[ln['scene']] = (a, dur, ln['text'])
    # timeline
    order = ['open', 'intro', 'box'] + [f'play{i}' for i in range(len(spec['plays']))] + (['stats'] if spec['stats']['away'].get('yards') else []) + [f'leader{i}' for i in range(len(spec['leaders']))] + ['outro']
    minimum = {'open': 1.7, 'intro': 4.2, 'box': 3.6, 'stats': 3.6, 'outro': 3.4}
    scenes, t = [], 0.0
    for s in order:
        if s == 'box' and not spec['away'].get('linescores'): continue
        v = voice_by_scene.get(s)
        dur = max(minimum.get(s, 3.0), (v[1] + 0.55) if v else 0)
        if s == 'outro': dur += 0.8
        scenes.append({'name': s, 'start': round(t, 3), 'dur': round(dur, 3), 'text': v[2] if v else ''})
        t += dur
    total = t
    # audio: voice placed per scene, music ducked under it (sidechain)
    vtrack = np.zeros(int(total * SR) + SR, np.float32)
    for sc in scenes:
        v = voice_by_scene.get(sc['name'])
        if v and v[0] is not None:
            i = int((sc['start'] + 0.25) * SR)
            seg = v[0][: len(vtrack) - i]
            vtrack[i:i + len(seg)] += seg
    hits = [(0.45, 'impact')] + [(sc['start'], 'whoosh') for sc in scenes[1:]]
    music = synth_music(total, hits)
    write_wav(os.path.join(tmp, 'voice.wav'), vtrack[: len(music)])
    write_wav(os.path.join(tmp, 'music.wav'), music)
    video_only = os.path.join(tmp, 'v.mp4')
    asyncio.run(render(spec, scenes, video_only))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video_only, '-i', os.path.join(tmp, 'voice.wav'), '-i', os.path.join(tmp, 'music.wav'),
                    '-filter_complex', '[1:a]asplit=2[v1][v2];[2:a][v1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[m];[m][v2]amix=inputs=2:weights=0.55 1.0:normalize=0,alimiter=limit=0.95[a]',
                    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out + '.part.mp4'], check=True)
    os.replace(out + '.part.mp4', out)
    print(f'recap video: {out} ({os.path.getsize(out) / 1e6:.1f} MB, {total:.0f}s) — {spec["title"]}')
    subprocess.run(['rm', '-rf', tmp])


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
