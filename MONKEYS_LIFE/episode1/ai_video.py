"""Make Episode 1 with AI video models, through one fal.ai key (FAL_KEY — a GitHub secret, never in the repo or chat).

    python ai_video.py plan  [--scene 0|all] [--only 1,4,7-9]             what would be sent + rough cost (no key needed)
    python ai_video.py cast  [--out DIR]                                  photoreal references: Seven (from the 3D renders)
                                                                          and the troop, 3-4 views each
    python ai_video.py shots --scene 0 [--only ...] [--max-usd 60] --cast DIR [--out DIR] [--workers 4]
    python ai_video.py ci | keep                                          what the workflow "Monkey AI video" runs

Shots with characters go to Kling 3.0 Omni reference-to-video: each character is an "element" built from the cast
pictures, so Seven, Grub, Petch and Dolo stay the same chimps from clip to clip. Shots with nobody in them (his POV,
landscapes, memory flashes) go to Kling 3.0 Omni text-to-video. Clips come back with their own natural sound; the
subtitles, Seven's English words, captions and title cards are added in the edit (cut.py).
"""
import concurrent.futures as cf, json, os, re, shutil, subprocess, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from ep import CHAR, LOOK, NAME, PLACE, FLASH                                              # noqa: E402
from build import SCENES                                                                  # noqa: E402

EP = dict(  # endpoints on fal.ai; override with env ML_EP_<KEY> if fal renames one
    ref2v=os.environ.get('ML_EP_REF2V', 'fal-ai/kling-video/o3/standard/reference-to-video'),
    t2v=os.environ.get('ML_EP_T2V', 'fal-ai/kling-video/o3/standard/text-to-video'),
    t2i=os.environ.get('ML_EP_T2I', 'fal-ai/nano-banana-pro'),
    edit=os.environ.get('ML_EP_EDIT', 'fal-ai/nano-banana-pro/edit'))
RATE = dict(ref2v=0.224, t2v=0.224, image=0.15)       # USD estimates (Kling 3.0 Omni standard with sound, per second)
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


def request(n, sc, s):
    """-> (endpoint key, arguments without image URLs filled in, element cast keys)"""
    look = s['look'] or sc.get('look', 'dry')
    dur = str(max(3, min(15, s['sec'] + 1)))
    snd = (s['snd'] or 'the natural sounds of the place') + '; only natural sounds and chimpanzee noises, no human speech'
    if s['kind'] == 'flash':
        text = f"{s['act'].strip()} {FLASH} Sound: {snd}."
        return 't2v', dict(prompt=text, duration=dur, aspect_ratio='16:9', generate_audio=True), []
    where = 'Setting: ' + PLACE[s['place'] or sc['place']] + '.'
    cam = f" Camera: {s['cam']}." if s['cam'] else ''
    if not s['who']:
        text = f"{s['act'].strip()} {where}{cam} {STYLE} Sound: {snd}."
        return 't2v', dict(prompt=text, duration=dur, aspect_ratio='16:9', generate_audio=True), []
    keys = [('seven_mud' if c == 'S' and look == 'mud' else WHO[c]) for c in s['who']]
    names = ' '.join(f"@Element{i + 1} is {NAME[c]}{SEVEN_HINT if c == 'S' else ''}." for i, c in enumerate(s['who']))
    fur = f" Seven's fur is {LOOK[look]}." if 'S' in s['who'] else ''
    text = f"{names}{fur} {s['act'].strip()} {where}{cam} {STYLE} Sound: {snd}."
    return 'ref2v', dict(prompt=text, duration=dur, aspect_ratio='16:9', generate_audio=True), keys


def plan(scene=None, only=None):
    rows = []
    for n, k, sc, s in clips():
        if scene is not None and k != scene: continue
        if only and n not in only: continue
        ep, a, keys = request(n, sc, s); rows.append((n, k, ep, a, keys, int(a['duration']) * RATE[ep]))
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


def elements(cast_dir):
    """Upload the cast pictures once -> {cast key: element dict for Kling}."""
    fal = _fal(); names = json.load(open(os.path.join(cast_dir, 'cast.json'))); url = {}
    for key, f in names.items(): url[key] = fal.upload_file(os.path.join(cast_dir, f))
    el = {}
    for char in CAST:
        refs = [url[f'{char}/{v}'] for v, *_ in CAST[char] if v != 'front' and f'{char}/{v}' in url]
        if char == 'seven_mud': refs += [url['seven/angle']] if 'seven/angle' in url else []
        el[char] = dict(frontal_image_url=url[f'{char}/front'], reference_image_urls=refs[:3])
    return el


def shots(scene, only, max_usd, cast_dir, out, workers=4, have=()):
    fal = _fal(); os.makedirs(out, exist_ok=True)
    rows = [r for r in plan(scene, only or None) if r[0] not in have]
    todo, spend = [], 0.0
    for r in rows:
        if spend + r[5] > max_usd: break
        todo.append(r); spend += r[5]
    skipped = [r[0] for r in rows if r not in todo]
    print(f'{len(todo)} clips to make, about ${spend:.0f}' + (f'; over the ${max_usd:.0f} cap, not made: {skipped}' if skipped else ''), flush=True)
    el = elements(cast_dir) if any(r[2] == 'ref2v' for r in todo) else {}
    man_path = os.path.join(out, 'manifest.json'); manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}

    def one(r):
        n, k, ep, a, keys, usd = r; a = dict(a)
        if keys: a['elements'] = [el[key] for key in keys]
        rec = dict(n=n, scene=k, endpoint=EP[ep], duration=a['duration'], usd=round(usd, 2), prompt=a['prompt'])
        try:
            h = fal.submit(EP[ep], arguments=a); rec['request_id'] = getattr(h, 'request_id', '')
            res = h.get(); raw = os.path.join(out, f'{n:03d}_raw.mp4'); _save(res['video']['url'], raw)
            dst = os.path.join(out, f'{n:03d}.mp4')
            if shutil.which('ffmpeg'):                                       # same picture, a third of the size
                p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-crf', '19', '-preset', 'veryfast',
                                    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dst])
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
    made = sum(1 for r in manifest.values() if r['status'] == 'made')
    print(f'done: {made} clips made in this folder, {sum(1 for r in manifest.values() if r["status"] == "failed")} failed')
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
    only = numbers(SAFE(os.environ.get('ML_ONLY'))); max_usd = float(SAFE(os.environ.get('ML_MAX_USD')) or 60)
    scene = None if scene_s == 'all' else int(scene_s)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if mode == 'plan':
        rows = plan(scene, only); usd = sum(r[5] for r in rows)
        lines = [f'{len(rows)} clips, about ${usd:.0f}', '']
        lines += [f"#{r[0]:03d} {r[2]} {r[3]['duration']}s {'+'.join(r[4]) or '-'}  {r[3]['prompt'][:110]}" for r in rows]
        print('\n'.join(lines))
        if summary: open(summary, 'a').write('```\n' + '\n'.join(lines) + '\n```\n')
        return
    os.makedirs('keep', exist_ok=True)
    if mode == 'cast':
        cast('keep'); open('keep_branch.txt', 'w').write('ep1-ai/cast'); return
    if mode == 'shots':
        if not _clone('ep1-ai/cast', 'cast_in'): print('::error::Make the cast first (mode cast).'); sys.exit(1)
        targets = sorted({k for _, k, *_ in plan(scene, only)})
        for k in targets:
            br = f'ep1-ai/s{k:02d}'; _clone(br, 'keep')
            have = set() if only else {int(f[:3]) for f in os.listdir('keep') if re.fullmatch(r'\d{3}\.mp4', f)}
            man = shots(k, only, max_usd, 'cast_in', 'keep', have=have)
            max_usd -= sum(r['usd'] for r in man.values() if r.get('status') == 'made' and r['scene'] == k and r['n'] not in have)
            keep(br); shutil.rmtree('keep'); os.makedirs('keep')
            if max_usd <= 0: break
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
    if cmd == 'plan':
        rows = plan(scene, only)
        for n, k, ep, a, keys, usd in rows: print(f"#{n:03d} s{k} {ep:5s} {a['duration']:>2}s ${usd:5.2f} {'+'.join(keys) or '-':24s} {a['prompt'][:90]}")
        print(f'{len(rows)} clips, about ${sum(r[5] for r in rows):.0f}')
    elif cmd == 'cast': cast(arg('--out', 'cast'))
    elif cmd == 'shots': shots(scene, only, float(arg('--max-usd', 60)), arg('--cast', 'cast'), arg('--out', 'clips'), int(arg('--workers', 4)))
    elif cmd == 'ci': ci()
    elif cmd == 'keep': keep()


if __name__ == '__main__': main()
