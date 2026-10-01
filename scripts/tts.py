"""Give SMASH the lion a real voice: turn the 10-minute briefing and the 30-minute live show into neural-voice MP3s.
Runs in GitHub Actions after build-static.js. Uses Microsoft Edge's free neural voices via the edge-tts package.
Clips are cached by text, so each one is only generated once. If anything fails, the app falls back to the phone's voice."""
import asyncio, json, os, sys, hashlib, shutil, time
from datetime import datetime, timezone

DIST = os.environ.get('STATIC_OUT', 'dist')
DATA = os.environ.get('DATA_DIR', 'data')
CACHE = os.environ.get('AUDIO_CACHE', '/tmp/smash-audio')
VOICE = os.environ.get('LION_VOICE', 'en-US-BrianMultilingualNeural')  # conversational, upbeat, natural
RATE = os.environ.get('LION_RATE', '+4%')
PITCH = os.environ.get('LION_PITCH', '+0Hz')  # no pitch shifting: it makes voices sound processed
BITRATE = 48000  # edge-tts default output: 24 kHz, 48 kbit/s mono MP3

def clip_name(text):
    return hashlib.sha1(f"{VOICE}|{RATE}|{PITCH}|{text}".encode()).hexdigest()[:16] + '.mp3'

async def voice(segments, label):
    import edge_tts
    os.makedirs(CACHE, exist_ok=True)
    outdir = os.path.join(DIST, 'audio')
    os.makedirs(outdir, exist_ok=True)
    ok = 0
    made = 0
    async def one(i, seg):
        nonlocal ok, made
        name = clip_name(seg['text'])
        cached = os.path.join(CACHE, name)
        if not (os.path.exists(cached) and os.path.getsize(cached) > 1000):
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(seg['text'], VOICE, rate=RATE, pitch=PITCH).save(cached + '.part')
                    if os.path.getsize(cached + '.part') > 1000:
                        os.replace(cached + '.part', cached); made += 1
                        break
                except Exception as e:
                    print(f"tts {label} segment {i} attempt {attempt + 1}: {e}", file=sys.stderr)
                    await asyncio.sleep(1.5)
        if os.path.exists(cached) and os.path.getsize(cached) > 1000:
            os.utime(cached)
            shutil.copyfile(cached, os.path.join(outdir, name))
            seg['audio'] = f"audio/{name}"
            seg['dur'] = round(os.path.getsize(cached) * 8 / BITRATE + 0.35, 2)  # real clip length + short pause
            ok += 1
        else:
            seg.pop('audio', None)
    sem = asyncio.Semaphore(6)
    async def guarded(i, seg):
        async with sem:
            await one(i, seg)
    await asyncio.gather(*(guarded(i, s) for i, s in enumerate(segments)))
    print(f"tts {label}: {ok}/{len(segments)} voiced ({made} new) with {VOICE}")
    return ok

async def main():
    # 10-minute briefing
    bp = os.path.join(DIST, 'api', 'briefing.json')
    if os.path.exists(bp):
        b = json.load(open(bp))
        ok = await voice(b['segments'], 'briefing')
        b['voice'] = VOICE if ok else None
        b['audioReady'] = ok == len(b['segments'])
        json.dump(b, open(bp, 'w'))
    # 30-minute live show
    sp = os.path.join(DIST, 'api', 'show.json')
    if os.path.exists(sp):
        s = json.load(open(sp))
        ok = await voice(s['segments'], 'show')
        t = 0.0
        for seg in s['segments']:
            seg['start'] = round(t, 2)
            t += seg.get('dur', 3)
        s['totalSeconds'] = round(t)
        s['voice'] = VOICE if ok else None
        s['audioReady'] = ok == len(s['segments'])
        if not s.get('startsAt') and ok >= len(s['segments']) * 0.9:
            s['startsAt'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')  # goes on air now
        if not s.get('startsAt'):
            s['startsAt'] = s.get('createdAt')
            s['pendingVoice'] = True
        else:
            s.pop('pendingVoice', None)
        json.dump(s, open(sp, 'w'))
        if os.path.isdir(DATA):
            keep = dict(s)
            if keep.get('pendingVoice'): keep['startsAt'] = None
            json.dump(keep, open(os.path.join(DATA, 'show.json'), 'w'))
        print(f"show: {len(s['segments'])} segments, {s['totalSeconds'] / 60:.1f} min, on air since {s['startsAt']}")
    # prune clips not used for 6 hours
    cutoff = time.time() - 6 * 3600
    for f in os.listdir(CACHE) if os.path.isdir(CACHE) else []:
        p = os.path.join(CACHE, f)
        if os.path.getmtime(p) < cutoff:
            os.remove(p)

asyncio.run(main())
