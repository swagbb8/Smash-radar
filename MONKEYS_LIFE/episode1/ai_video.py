"""Make Episode 1 with AI video models, through one fal.ai key (FAL_KEY — a GitHub secret, never in the repo or chat).

    python ai_video.py plan  [--scene 0|all] [--only 1,4,7-9] [--model h3|kling]   what would be sent + rough cost
    python ai_video.py cast  [--out DIR]                                  photoreal references: Seven (from the 3D renders)
                                                                          and the troop, 3-4 views each
    python ai_video.py shots --scene 0 [--only ...] [--max-usd 25] [--model h3|kling] --cast DIR [--out DIR]
    python ai_video.py ci | keep                                          what the workflow "Monkey AI video" runs

Two video models, picked per run (env ML_MODEL or --model):
  h3    MiniMax H3 Max (default, ~$0.08/s at 768P). Shots with characters use reference-to-video with each character's
        cast pictures as Image 1, Image 2, ...; shots with nobody in them use text-to-video. Sound comes with the clip
        (fal: "audio in the same pass"); a clip that arrives silent goes through MMAudio (video-to-audio) instead.
  kling Kling 3.0 Omni (~$0.22/s with sound). Characters are "elements" built from the cast pictures; sound built in.
  ltx   FREE route: open models on Modal's free monthly credit (modal_app.py). Every shot with a character first gets
        a still (Qwen-Image-Edit, from the cast pictures) that LTX-2.5 then brings to life with sound; shots with
        nobody in them are LTX-2.5 text-to-video. Needs MODAL_TOKEN_ID, MODAL_TOKEN_SECRET and HF_TOKEN (all secrets).
Subtitles, Seven's English words, captions and title cards are added in the edit (cut.py).
"""
import concurrent.futures as cf, json, os, re, shutil, subprocess, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from ep import CHAR, LOOK, NAME, PLACE, FLASH                                              # noqa: E402
from build import SCENES                                                                  # noqa: E402

_env = lambda k, d: os.environ.get('ML_EP_' + k.upper(), d)      # override an endpoint if fal renames it
EP = dict(
    kling_ref=_env('kling_ref', 'fal-ai/kling-video/o3/standard/reference-to-video'),
    kling_t2v=_env('kling_t2v', 'fal-ai/kling-video/o3/standard/text-to-video'),
    h3_ref=_env('h3_ref', 'minimax/h3-max/reference-to-video'),
    h3_t2v=_env('h3_t2v', 'minimax/h3-max/text-to-video'),
    audio=_env('audio', 'fal-ai/mmaudio-v2'),
    t2i=_env('t2i', 'fal-ai/nano-banana-pro'),
    edit=_env('edit', 'fal-ai/nano-banana-pro/edit'))
RATE = dict(kling_ref=0.224, kling_t2v=0.224, h3_ref=0.08, h3_t2v=0.08, audio=0.01, image=0.15)   # USD estimates
H3_RES = os.environ.get('ML_H3_RES', '768P')
# Free route (Modal): H100 time, $0.001097 a second out of the $30 free monthly credit. GPU seconds are estimates
# until a real run has been timed: per clip ~40 s + 8 s per second of video (two stages, 1280x704), per still ~25 s.
H100 = 0.001097
LTX_W, LTX_H = int(os.environ.get('ML_LTX_W', 1280)), int(os.environ.get('ML_LTX_H', 704))
LTX_GPU_S = lambda secs: 40 + 8 * secs
STILL_GPU_S = 25
STYLE = ("Photorealistic live action, nature-documentary realism: real chimpanzee anatomy, skin and fur. Cinematic 35mm "
         "film look, shallow depth of field, natural light. No text, no subtitles, no humans, no music.")
SEVEN_HINT = ' (the huge, ragged chimpanzee with the shattered device in his left forearm)'
PHOTO = 'Real wildlife photograph, natural light, sharp focus on the eyes. No text, no watermark.'

# The cast: per character, views made in order; '@view' or '@char/view' = an earlier result used as the reference.
CAST = {
    'seven': [
        ('front', 'edit', ['ref/seven_face.jpg', 'ref/seven_body.jpg', 'ref/seven_device.jpg'],
         'Turn this 3D render into a real wildlife photograph of the same individual: the same huge, ragged adult male '
         'chimpanzee with the same face, brow, ears and build — bigger and more powerful than a normal chimp, scrappy '
         'and scarred, dark fur. Fused under the skin of his LEFT forearm is a palm-sized device: a thin scar line, '
         'faint cold-blue circuit lines under the fur, a small shattered glass screen. Chest-up portrait facing the '
         'camera, dim green jungle behind him. ' + PHOTO),
        ('full', 'edit', ['@front'], 'The same chimpanzee, full body, standing on all fours on a mossy log in a dim '
         'jungle, side view, his left forearm with the device toward the camera. ' + PHOTO),
        ('angle', 'edit', ['@front'], 'The same chimpanzee sitting on a branch, three-quarter view, looking off to the '
         'side. ' + PHOTO),
        ('arm', 'edit', ['@front', 'ref/seven_device.jpg'], 'Close-up of the same chimpanzee\'s left forearm: the '
         'palm-sized device under the skin, the scar line, faint cold-blue circuit lines in the fur, the small '
         'shattered glass screen. Real macro photograph, natural light. No text.'),
    ],
    'seven_mud': [
        ('front', 'edit', ['@seven/front'], 'The same chimpanzee, now caked head to toe in wet black swamp mud, mud '
         'dripping from his face and fur, the device in his left forearm smeared with mud. Chest-up, dark swamp behind '
         'him, dim cold light. ' + PHOTO),
        ('full', 'edit', ['@front'], 'The same mud-caked chimpanzee, full body, standing knee-deep in black swamp mud '
         'among dark tree trunks, dim cold light. ' + PHOTO),
    ],
}
for _c, _key in (('G', 'grub'), ('P', 'petch'), ('D', 'dolo')):
    _d = CHAR[_c].split(' — ', 1)[1]
    CAST[_key] = [
        ('front', 't2i', [], f'Wildlife portrait photograph of {_d}. Chest-up, facing the camera, dim green jungle '
         'behind. ' + PHOTO),
        ('full', 'edit', ['@front'], 'The same chimpanzee, full body, on all fours on a mossy branch in a dim jungle, '
         'side view. ' + PHOTO),
        ('angle', 'edit', ['@front'], 'The same chimpanzee sitting, three-quarter view, looking off to the side. ' + PHOTO),
    ]
WHO = {'S': 'seven', 'G': 'grub', 'P': 'petch', 'D': 'dolo'}


def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def numbers(spec):
    """'1,4,7-9' -> {1, 4, 7, 8, 9}"""
    out = set()
    for part in (spec or '').replace(' ', '').split(','):
        if not part: continue
        a, _, b = part.partition('-'); out.update(range(int(a), int(b or a) + 1))
    return out


def clips():
    """(n, scene index, scene, shot) for every clip the episode needs, numbered exactly like the page."""
    n = 0
    for k, sc in enumerate(SCENES):
        for s in sc['shots']:
            if s['kind'] == 'mine': continue
            n += 1; yield n, k, sc, s


def request(n, sc, s, model='h3'):
    """-> (endpoint key, arguments without image URLs, cast keys of the characters in it, sound prompt, seconds)"""
    look = s['look'] or sc.get('look', 'dry')
    if model == 'ltx': return ltx_request(sc, s, look)
    secs = max(3 if model == 'kling' else 5, min(15, s['sec'] + 1))          # H3 Max makes 5-15 s, Kling 3-15 s
    snd = s['snd'] or 'the natural sounds of the place'
    if s['who']: snd += ', chimpanzee breathing, grunts and hoots where they react'
    nospeech = '; only natural sounds and chimpanzee noises, no human speech, no music'
    if model == 'kling':
        base = dict(duration=str(secs), aspect_ratio='16:9', generate_audio=True)
    else:
        base = dict(duration=float(secs), resolution=H3_RES, aspect_ratio='16:9', prompt_expansion_mode='disabled')
    t2v = model + '_t2v'
    if s['kind'] == 'flash':
        text = f"{s['act'].strip()} {FLASH} Sound: {snd}{nospeech}."
        return t2v, dict(base, prompt=text), [], snd, secs
    where = 'Setting: ' + PLACE[s['place'] or sc['place']] + '.'
    cam = f" Camera: {s['cam']}." if s['cam'] else ''
    tail = f" {where}{cam} {STYLE} Sound: {snd}{nospeech}."
    if not s['who']:
        return t2v, dict(base, prompt=s['act'].strip() + tail), [], snd, secs
    keys = [('seven_mud' if c == 'S' and look == 'mud' else WHO[c]) for c in s['who']]
    fur = f" Seven's fur is {LOOK[look]}." if 'S' in s['who'] else ''
    if model == 'kling':
        names = ' '.join(f"@Element{i + 1} is {NAME[c]}{SEVEN_HINT if c == 'S' else ''}." for i, c in enumerate(s['who']))
    else:                                     # two pictures per character: Image 1-2 = first character, Image 3-4 = next...
        names = ' '.join(f"Image {2 * i + 1} and Image {2 * i + 2} show {NAME[c]}{SEVEN_HINT if c == 'S' else ''}."
                         for i, c in enumerate(s['who'])) + ' Keep every chimpanzee exactly as in his or her pictures.'
    return model + '_ref', dict(base, prompt=f"{names}{fur} {s['act'].strip()}{tail}"), keys, snd, secs


def ltx_request(sc, s, look):
    """Free route: the clip prompt (LTX likes one long paragraph: who, action, place, camera, light, sound) and, for
    shots with characters, the prompt of the still it starts from."""
    secs = max(3, min(15, s['sec'] + 1))
    snd = (s['snd'] or 'the natural sounds of the place') + (', chimpanzee breathing, grunts and hoots where they react'
                                                              if s['who'] else '')
    sound = f' Sound: {snd}; only natural sounds and chimpanzee noises, no human speech, no music.'
    if s['kind'] == 'flash':
        return 'ltx_t2v', dict(prompt=f"{s['act'].strip()} {FLASH}{sound}", secs=secs), [], snd, secs
    where = 'Setting: ' + PLACE[s['place'] or sc['place']] + '.'
    cam = f" Camera: {s['cam']}." if s['cam'] else ''
    who = ' '.join(CHAR[c].format(look=LOOK[look]) + '.' for c in s['who'])
    text = f"{who} {s['act'].strip()} {where}{cam} {STYLE}{sound}".strip()
    if not s['who']: return 'ltx_t2v', dict(prompt=text, secs=secs), [], snd, secs
    refs, names = still_layout(s['who'], look)
    fur = f" Seven's fur is {LOOK[look]}; the device is in his LEFT forearm." if 'S' in s['who'] else ''
    still = (f"{names}. A photorealistic 16:9 film still, the very first moment of this shot: {s['act'].strip()} {where}"
             f"{cam}{fur} Keep every chimpanzee exactly as in his or her picture: same face, fur, build and size. "
             "Real wildlife cinematography, natural light, shallow depth of field. No text, no humans.")
    return 'ltx_i2v', dict(prompt=text, secs=secs, still=still), refs, snd, secs


def still_layout(who, look):
    """Which cast pictures a shot's still is made from (at most 3; 'a+b' = two portraits side by side) and how the
    prompt names them."""
    key = lambda c: 'seven_mud' if c == 'S' and look == 'mud' else WHO[c]
    if len(who) == 1:
        k = key(who[0]); third = 'seven/arm' if who[0] == 'S' else f'{k}/angle'
        note = ', Image 3 is a close-up of his left forearm with the device' if who[0] == 'S' else ''
        return [f'{k}/front', f'{k}/full', third], f'Images 1 to 3 show {NAME[who[0]]}{note}'
    refs = [f'{key(c)}/front' for c in who[:2]]
    names = '; '.join(f'Image {i + 1} shows {NAME[c]}' for i, c in enumerate(who[:2]))
    if len(who) == 2 and 'S' in who:
        refs.append('seven/arm'); names += "; Image 3 is a close-up of Seven's left forearm with the device"
    elif len(who) == 3:
        refs.append(f'{key(who[2])}/front'); names += f'; Image 3 shows {NAME[who[2]]}'
    elif len(who) == 4:
        refs.append(f'{key(who[2])}/front+{key(who[3])}/front')
        names += f'; Image 3 shows {NAME[who[2]]} (left) and {NAME[who[3]]} (right)'
    return refs, names


def cost(ep, secs, model):
    """Estimate, with a little room for the odd silent clip that needs MMAudio. Free route: share of the free credit."""
    if model == 'ltx': return (LTX_GPU_S(secs) + (STILL_GPU_S if ep == 'ltx_i2v' else 0)) * H100
    return secs * RATE[ep] + (secs * RATE['audio'] * 0.25 if model == 'h3' else 0)


def has_audio(path):
    if not shutil.which('ffprobe'): return True
    p = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return bool(p.stdout.strip())


def plan(scene=None, only=None, model='h3'):
    rows = []
    for n, k, sc, s in clips():
        if scene is not None and k != scene: continue
        if only and n not in only: continue
        ep, a, keys, snd, secs = request(n, sc, s, model)
        rows.append(dict(n=n, scene=k, ep=ep, args=a, keys=keys, snd=snd, secs=secs, usd=cost(ep, secs, model)))
    return rows


# ---------------------------------------------------------------------------------------------------------------- fal
def _fal():
    if not os.environ.get('FAL_KEY'):
        print('::error::No FAL_KEY yet. Add it as a repository secret named FAL_KEY (GitHub: Settings > Secrets and '
              'variables > Actions > New repository secret).'); sys.exit(1)
    import fal_client
    return fal_client


def _save(url, path):
    for attempt in range(5):
        try: urllib.request.urlretrieve(url, path); return
        except Exception:
            if attempt == 4: raise
            time.sleep(3 + 4 * attempt)


def cast(out):
    """Make the reference pictures. Each view is one image; cast.json maps 'char/view' -> file name."""
    fal = _fal(); os.makedirs(out, exist_ok=True); made = {}; local = {}
    up = lambda p: fal.upload_file(p)
    for char, views in CAST.items():
        for view, how, refs, text in views:
            urls = []
            for r in refs:
                if r.startswith('@'):
                    key = r[1:] if '/' in r else f'{char}/{r[1:]}'; urls.append(made[key])
                else: urls.append(up(os.path.join(HERE, r)))
            args = dict(prompt=text, num_images=1, aspect_ratio='4:5', resolution='2K', output_format='jpeg')
            if how == 'edit': args['image_urls'] = urls
            res = fal.subscribe(EP['edit' if how == 'edit' else 't2i'], arguments=args, client_timeout=600)
            url = res['images'][0]['url']; made[f'{char}/{view}'] = url
            name = f'{char}_{view}.jpg'; _save(url, os.path.join(out, name)); local[f'{char}/{view}'] = name
            print('cast', char, view, flush=True)
    json.dump(local, open(os.path.join(out, 'cast.json'), 'w'), indent=1)
    return local


def uploads(cast_dir):
    """Upload the cast pictures once -> {'char/view': url}."""
    fal = _fal(); names = json.load(open(os.path.join(cast_dir, 'cast.json')))
    return {key: fal.upload_file(os.path.join(cast_dir, f)) for key, f in names.items()}


def kling_elements(url, keys):
    out = []
    for char in keys:
        refs = [url[f'{char}/{v}'] for v, *_ in CAST[char] if v != 'front' and f'{char}/{v}' in url]
        if char == 'seven_mud' and 'seven/angle' in url: refs.append(url['seven/angle'])
        out.append(dict(frontal_image_url=url[f'{char}/front'], reference_image_urls=refs[:3]))
    return out


def h3_refs(url, keys):
    return [url[f'{char}/{v}'] for char in keys for v in ('front', 'full')]


def shots(scene, only, max_usd, cast_dir, out, workers=4, have=(), model='h3'):
    fal = _fal(); os.makedirs(out, exist_ok=True)
    rows = [r for r in plan(scene, only or None, model) if r['n'] not in have]
    todo, spend = [], 0.0
    for r in rows:
        if spend + r['usd'] > max_usd: break
        todo.append(r); spend += r['usd']
    skipped = [r['n'] for r in rows[len(todo):]]
    print(f'{len(todo)} clips to make with {model}, about ${spend:.0f}' +
          (f'; over the ${max_usd:.0f} cap, not made: {skipped}' if skipped else ''), flush=True)
    url = uploads(cast_dir) if any(r['keys'] for r in todo) else {}
    man_path = os.path.join(out, 'manifest.json'); manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}

    def one(r):
        n = r['n']; a = dict(r['args'])
        if r['keys']:
            if model == 'kling': a['elements'] = kling_elements(url, r['keys'])
            else: a['reference_image_urls'] = h3_refs(url, r['keys'])
        rec = dict(n=n, scene=r['scene'], model=model, endpoint=EP[r['ep']], secs=r['secs'], usd=round(r['usd'], 2),
                   prompt=a['prompt'])
        try:
            h = fal.submit(EP[r['ep']], arguments=a); rec['request_id'] = getattr(h, 'request_id', '')
            video = h.get()['video']['url']
            raw = os.path.join(out, f'{n:03d}_raw.mp4'); _save(video, raw); dst = os.path.join(out, f'{n:03d}.mp4')
            rec['sound'] = 'own'
            if not has_audio(raw):                                            # arrived silent: MMAudio adds the sound
                try:
                    res = fal.subscribe(EP['audio'], arguments=dict(
                        video_url=video, prompt=r['snd'], duration=float(r['secs']),
                        negative_prompt='music, singing, human speech, voices, talking'), client_timeout=900)
                    _save(res['video']['url'], raw); rec['sound'] = 'mmaudio'
                except Exception as e:
                    rec['sound'] = 'none: ' + str(e)[:200]
            if shutil.which('ffmpeg'):                                       # same picture, a fraction of the size
                p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-crf', '19', '-preset',
                                    'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dst])
                if p.returncode: os.replace(raw, dst)
                else: os.remove(raw)
            else: os.replace(raw, dst)
            rec['status'] = 'made'; rec['file'] = os.path.basename(dst)
        except Exception as e:                                                # a refused or failed clip: note it, go on
            rec['status'] = 'failed'; rec['error'] = str(e)[:600]
        print(f"#{n:03d} {rec['status']}" + (f": {rec.get('error', '')[:160]}" if rec['status'] != 'made' else ''), flush=True)
        return rec

    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        for rec in pool.map(one, todo):
            manifest[str(rec['n'])] = rec
            json.dump(manifest, open(man_path, 'w'), indent=1)
    print(f"done: {sum(1 for r in manifest.values() if r['status'] == 'made')} clips here, "
          f"{sum(1 for r in manifest.values() if r['status'] == 'failed')} failed")
    return manifest


# ------------------------------------------------------------------------------------------------- free route (Modal)
def _modal():
    missing = [k for k in ('MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET', 'HF_TOKEN') if not os.environ.get(k)]
    if missing:
        print(f"::error::Missing secret(s): {', '.join(missing)}. Add them at GitHub: Settings > Secrets and variables > "
              'Actions > New repository secret.'); sys.exit(1)
    import modal, modal_app
    return modal, modal_app


def _collage(a, b):
    from PIL import Image
    import io
    ia, ib = (Image.open(io.BytesIO(x)).convert('RGB') for x in (a, b))
    h = min(ia.height, ib.height); ia, ib = (im.resize((round(im.width * h / im.height), h)) for im in (ia, ib))
    out = Image.new('RGB', (ia.width + ib.width + 16, h), (0, 0, 0)); out.paste(ia, (0, 0)); out.paste(ib, (ia.width + 16, 0))
    buf = io.BytesIO(); out.save(buf, 'JPEG', quality=92); return buf.getvalue()


def cast_ltx(out):
    """The cast on the free route: the troop from text, Seven from the 3D renders, then the other views from those."""
    modal, M = _modal(); os.makedirs(out, exist_ok=True); local = {}
    read = lambda p: open(os.path.join(HERE, p), 'rb').read()
    jobs = [dict(name=f'{k}/front', prompt=CAST[k][0][3], refs=[], w=896, h=1120, steps=40, seed=3) for k in ('grub', 'petch', 'dolo')]
    for char, views in CAST.items():
        for view, how, refs, text in views:
            if view == 'front' and how == 't2i': continue
            r = [('@' + (x[1:] if '/' in x else f'{char}/{x[1:]}')) if x.startswith('@') else read(x) for x in refs]
            jobs.append(dict(name=f'{char}/{view}', prompt=text, refs=r, w=896, h=1120, steps=40, seed=3))
    with modal.enable_output(), M.app.run():
        for name, data, note in M.Stills().make.remote_gen(jobs):
            print('cast', name, note, flush=True)
            if data:
                f = name.replace('/', '_') + '.jpg'; open(os.path.join(out, f), 'wb').write(data); local[name] = f
                json.dump(local, open(os.path.join(out, 'cast.json'), 'w'), indent=1)
    return local


def shots_ltx(scene, only, cast_dir, out, have=(), max_minutes=50):
    """Stills for the shots with characters, then every clip, until the time for this run is up."""
    modal, M = _modal(); os.makedirs(out, exist_ok=True); t0 = time.time(); deadline = t0 + max_minutes * 60
    rows = [r for r in plan(scene, only or None, 'ltx') if r['n'] not in have]
    names = json.load(open(os.path.join(cast_dir, 'cast.json')))
    pic = {k: open(os.path.join(cast_dir, f), 'rb').read() for k, f in names.items()}
    man_path = os.path.join(out, 'manifest.json'); manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    key_of = lambda n: os.path.join(out, f'key_{n:03d}.jpg')
    stills = []
    for r in rows:
        if r['ep'] != 'ltx_i2v' or os.path.exists(key_of(r['n'])): continue
        refs = [_collage(*(pic[p] for p in k.split('+'))) if '+' in k else pic[k] for k in r['keys']]
        stills.append(dict(name=str(r['n']), prompt=r['args']['still'], refs=refs, w=LTX_W, h=LTX_H, steps=30, seed=r['n']))
    print(f"{len(rows)} clips to make for free on Modal ({len(stills)} stills first), at most {max_minutes} min", flush=True)

    def note(n, **kw):
        rec = manifest.setdefault(str(n), dict(n=n, scene=scene, model='ltx')); rec.update(kw)
        json.dump(manifest, open(man_path, 'w'), indent=1)
    with modal.enable_output(), M.app.run():
        if stills:
            for name, data, msg in M.Stills().make.remote_gen(stills, deadline):
                print(f'still #{int(name):03d} {msg}', flush=True)
                if data: open(key_of(int(name)), 'wb').write(data)
                note(int(name), still=msg)
        jobs = []
        for r in rows:
            img = open(key_of(r['n']), 'rb').read() if r['ep'] == 'ltx_i2v' and os.path.exists(key_of(r['n'])) else None
            if r['ep'] == 'ltx_i2v' and img is None: note(r['n'], status='failed', error='no still to start from'); continue
            jobs.append(dict(n=r['n'], prompt=r['args']['prompt'], image=img, secs=r['secs'], w=LTX_W, h=LTX_H, seed=r['n']))
        for n, data, msg in M.Clips().make.remote_gen(jobs, deadline):
            print(f'#{n:03d} {msg}', flush=True)
            if data: open(os.path.join(out, f'{n:03d}.mp4'), 'wb').write(data); note(n, status='made', clip=msg, file=f'{n:03d}.mp4')
            else: note(n, status='failed' if msg.startswith('failed') else 'waiting', error=msg)
    made = sum(1 for r in manifest.values() if r.get('status') == 'made')
    print(f'done in {(time.time() - t0) / 60:.0f} min: {made} clips here')
    return manifest


# ------------------------------------------------------------------------------------------------------- workflow side
SAFE = lambda v: re.sub(r'[^A-Za-z0-9,._-]', '', v or '')


def _git(*a, cwd=None, check=True):
    return subprocess.run(['git', *a], cwd=cwd, text=True, capture_output=True, check=check)


def _clone(branch, dst):
    """Copy the files of a result branch into dst (empty if the branch does not exist yet)."""
    os.makedirs(dst, exist_ok=True); tmp = dst + '_clone'; shutil.rmtree(tmp, ignore_errors=True)
    r = _git('clone', '-q', '--depth', '1', '-b', branch, os.environ['ML_REPO'], tmp, check=False)
    if r.returncode: return False
    for f in os.listdir(tmp):
        if f != '.git': shutil.move(os.path.join(tmp, f), os.path.join(dst, f))
    shutil.rmtree(tmp, ignore_errors=True); return True


def ci():
    mode = SAFE(os.environ.get('ML_MODE')); scene_s = SAFE(os.environ.get('ML_SCENE')) or '0'
    only = numbers(SAFE(os.environ.get('ML_ONLY'))); max_usd = float(SAFE(os.environ.get('ML_MAX_USD')) or 25)
    scene = None if scene_s == 'all' else int(scene_s)
    model = SAFE(os.environ.get('ML_MODEL')) or 'ltx'
    if model not in ('h3', 'kling', 'ltx'): print('::error::model must be ltx (free), h3 or kling'); sys.exit(1)
    max_minutes = float(SAFE(os.environ.get('ML_MAX_MINUTES')) or 50)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if mode == 'probe':                                  # which open models can be downloaded without an account
        lines = []                                       # shown as one annotation (logs can't be read from outside)
        for repo in ('Lightricks/LTX-2.5-Diffusers', 'Lightricks/LTX-2.5', 'diffusers/LTX-2.3-Diffusers', 'Lightricks/LTX-2.3',
                     'Lightricks/LTX-2', 'rootonchair/LTX-2-19b-distilled', 'Qwen/Qwen-Image-Edit-2511', 'Qwen/Qwen-Image-Edit-2509',
                     'Qwen/Qwen-Image-2512', 'Qwen/Qwen-Image', 'Wan-AI/Wan2.2-I2V-A14B-Diffusers', 'Wan-AI/Wan2.2-TI2V-5B-Diffusers',
                     'hkchengrex/MMAudio'):
            try:
                d = json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=30))
                size = sum(s.get('size') or 0 for s in d.get('siblings', [])) / 1e9
                lic = next((t[8:] for t in d.get('tags', []) if t.startswith('license:')), '?')
                lines.append(f"{repo} gated={d.get('gated')} license={lic} modified={d.get('lastModified', '')[:10]} {size:.0f} GB")
            except Exception as e:
                lines.append(f'{repo} not reachable: {str(e)[:80]}')
        for repo in (os.environ.get('ML_PROBE_FILES') or 'diffusers/LTX-2.3-Diffusers,Lightricks/LTX-2.3').split(','):
            try:
                d = json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=30))
                big = [f"{s['rfilename']} {(s.get('size') or 0) / 1e9:.1f}" for s in d.get('siblings', [])
                       if (s.get('size') or 0) > 2e8 or s['rfilename'].endswith(('model_index.json', 'config.json'))]
                lines.append(f'FILES {repo}: ' + ' | '.join(big[:60]))
            except Exception as e:
                lines.append(f'FILES {repo}: {str(e)[:80]}')
        print('::notice title=probe::' + '%0A'.join(lines))
        return
    if mode == 'plan':
        rows = plan(scene, only, model); usd = sum(r['usd'] for r in rows)
        lines = [f'{len(rows)} clips with {model}, about ${usd:.0f}', '']
        lines += [f"#{r['n']:03d} {r['ep']} {r['secs']}s {'+'.join(r['keys']) or '-'}  {r['args']['prompt'][:110]}" for r in rows]
        print('\n'.join(lines))
        if summary: open(summary, 'a').write('```\n' + '\n'.join(lines) + '\n```\n')
        return
    os.makedirs('keep', exist_ok=True)
    if mode == 'cast':
        open('keep_branch.txt', 'w').write('ep1-ai/cast')
        cast_ltx('keep') if model == 'ltx' else cast('keep'); return
    if mode == 'shots':
        if not _clone('ep1-ai/cast', 'cast_in'): print('::error::Make the cast first (mode cast).'); sys.exit(1)
        targets = sorted({r['scene'] for r in plan(scene, only, model)}); t_end = time.time() + max_minutes * 60
        for k in targets:
            br = f'ep1-ai/s{k:02d}'; _clone(br, 'keep'); open('keep_branch.txt', 'w').write(br)
            have = set() if only else {int(f[:3]) for f in os.listdir('keep') if re.fullmatch(r'\d{3}\.mp4', f)}
            if model == 'ltx':
                shots_ltx(k, only, 'cast_in', 'keep', have=have, max_minutes=max(1, (t_end - time.time()) / 60))
            else:
                man = shots(k, only, max_usd, 'cast_in', 'keep', have=have, model=model)
                max_usd -= sum(r['usd'] for r in man.values() if r.get('status') == 'made' and r['scene'] == k and r['n'] not in have)
            keep(br); shutil.rmtree('keep'); os.makedirs('keep')
            if max_usd <= 0 or time.time() > t_end: break
        return
    print('::error::mode must be plan, cast or shots'); sys.exit(1)


def keep(branch=None):
    """Whatever is in keep/ goes onto its own branch, replacing what was there."""
    br = branch or (open('keep_branch.txt').read().strip() if os.path.exists('keep_branch.txt') else '')
    if not br or not os.path.isdir('keep') or not os.listdir('keep'): print('nothing to keep'); return
    shutil.rmtree('keep/.git', ignore_errors=True)
    _git('init', '-q', '-b', 'k', cwd='keep'); _git('config', 'user.name', 'monkey-bot', cwd='keep')
    _git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com', cwd='keep')
    _git('add', '-A', cwd='keep'); _git('commit', '-qm', br, cwd='keep')
    for attempt in range(6):
        if not _git('push', '-q', '-f', os.environ['ML_REPO'], f'k:refs/heads/{br}', cwd='keep', check=False).returncode:
            print('kept on', br); shutil.rmtree('keep/.git', ignore_errors=True); return
        time.sleep(3 + attempt * 4)
    print('::error::could not keep ' + br); sys.exit(1)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    scene = arg('--scene', '0'); scene = None if scene == 'all' else int(scene); only = numbers(arg('--only'))
    model = arg('--model', os.environ.get('ML_MODEL', 'ltx'))
    if cmd == 'plan':
        rows = plan(scene, only, model)
        for r in rows: print(f"#{r['n']:03d} s{r['scene']} {r['ep']:9s} {r['secs']:>2}s ${r['usd']:5.2f} {'+'.join(r['keys']) or '-':24s} {r['args']['prompt'][:80]}")
        print(f'{len(rows)} clips with {model}, about ${sum(r["usd"] for r in rows):.0f}')
    elif cmd == 'cast': cast(arg('--out', 'cast'))
    elif cmd == 'shots': shots(scene, only, float(arg('--max-usd', 25)), arg('--cast', 'cast'), arg('--out', 'clips'), int(arg('--workers', 4)), model=model)
    elif cmd == 'ci': ci()
    elif cmd == 'keep': keep()


if __name__ == '__main__': main()
