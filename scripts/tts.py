"""Give SMASH the lion a real voice: turn the current briefing into neural-voice MP3s (one per segment).
Runs in GitHub Actions after build-static.js. Uses Microsoft Edge's free neural voices via the edge-tts package.
If anything fails, the app falls back to the phone's built-in voice automatically."""
import asyncio, json, os, sys, hashlib

DIST = os.environ.get('STATIC_OUT', 'dist')
VOICE = os.environ.get('LION_VOICE', 'en-US-AndrewMultilingualNeural')
RATE = os.environ.get('LION_RATE', '+8%')
PITCH = os.environ.get('LION_PITCH', '-4Hz')

async def main():
    import edge_tts
    path = os.path.join(DIST, 'api', 'briefing.json')
    b = json.load(open(path))
    outdir = os.path.join(DIST, 'audio')
    os.makedirs(outdir, exist_ok=True)
    ok = 0
    async def one(i, seg):
        nonlocal ok
        h = hashlib.sha1(f"{VOICE}|{RATE}|{PITCH}|{seg['text']}".encode()).hexdigest()[:16]
        name = f"{h}.mp3"
        dest = os.path.join(outdir, name)
        for attempt in range(3):
            try:
                await edge_tts.Communicate(seg['text'], VOICE, rate=RATE, pitch=PITCH).save(dest)
                if os.path.getsize(dest) > 1000:
                    seg['audio'] = f"audio/{name}"
                    ok += 1
                    return
            except Exception as e:
                print(f"tts segment {i} attempt {attempt + 1}: {e}", file=sys.stderr)
                await asyncio.sleep(1.5)
    sem = asyncio.Semaphore(4)
    async def guarded(i, seg):
        async with sem:
            await one(i, seg)
    await asyncio.gather(*(guarded(i, s) for i, s in enumerate(b['segments'])))
    b['voice'] = VOICE if ok else None
    b['audioReady'] = ok == len(b['segments'])
    json.dump(b, open(path, 'w'))
    print(f"tts: {ok}/{len(b['segments'])} segments voiced with {VOICE}")

asyncio.run(main())
