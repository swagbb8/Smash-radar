"""Episode 1 (v3 story) as AI footage: the Blender shot scripts in ../blender/ep1_*.py are read as the script (each shot
class's docstring = the action, `dur`, `lines`), and each shot becomes a photoreal keyframe (Qwen-Image-Edit with the cast
stills as references) and then a clip with sound (LTX image-to-video), all on Modal from the laptop (~/.modal.toml).
    python ai_scene.py <blender module> <cast folder> <out folder> [--only B01,B02] [--list SCENE1] [--plan]
Files land as <out>/<shot>.jpg (keyframe) and <out>/<shot>.mp4; shots already there are skipped. edit with cut_ai.py.
"""
import ast, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = os.path.join(HERE, '..', 'blender')

FILM = ('Film still from a big-budget live-action feature film, photoreal, like The Revenant or Dawn of the Planet of the '
        'Apes: real anatomy, real skin, individual hairs, wet eyes with catchlights. Anamorphic 2.39:1 framing, shallow depth '
        'of field, motivated low-key lighting with deep soft shadows, natural skin pores and dust, subtle 35mm film grain, Kodak Vision3 color, shot on ARRI Alexa 65. No text, no subtitles, no watermark.')
NEG = 'orange eyes, glowing eyes, white specks, glitter, sparkles in fur, sticker, flat even lighting, cartoon, 3d render, cgi look, plastic, doll, mask, painting, illustration, blurry, deformed hands, extra limbs, text, watermark'
SETS = {
    'lab': 'a sterile white laboratory test room under cold fluorescent light: a steel table, a metal stool, a monitor on a '
           'stand, a heavy steel door with a small square window',
    'swamp': 'a dark primeval swamp at dawn: black mud, still water, rows of huge mossy trees with hanging vines, thin shafts of '
             'light through the canopy',
    'stream': 'a clear rocky jungle stream with a still pool, ferns and mossy boulders, dappled late-morning sun',
    'forest': 'a deep ancient rainforest: giant buttressed trunks, ferns, hanging lianas, green gloom with shafts of sun',
    'clearing': 'a sunny jungle clearing of trampled grass and red earth under one giant spreading tree, forest all round',
    'ridge': 'a high rocky ridge above an endless jungle valley at golden hour, mist in the valleys',
    'night': 'the jungle at night under a sky full of stars, leaf nests high in the trees, moonlight',
}
PEOPLE = {'scientist_a': 'Dr A, a tired man in his fifties in a white lab coat and glasses',
          'scientist_b': 'Dr B, a sharp woman in her thirties in a white lab coat, hair tied back',
          'voice': 'a scientist (heard, not seen)'}
WHO = [('seven', r'\b(seven|he|his|him|chimp)\b'), ('grub', r'\bgrub\b'), ('petch', r'\bpetch\b'), ('dolo', r'\bdolo\b'),
       ('scientist_a', r'\b(dr a|people|scientists|them|two of them)\b'), ('scientist_b', r'\b(dr b|people|scientists|them|two of them)\b')]
# Seven's device (STORY.md + Ash's words): a palm-sized screen fused into his LEFT forearm. Intact in the lab until the
# rampage cracks it; shattered from then on.
DEVICE = {'intact': 'a palm-sized dark glass screen fused flush into the skin of his bare left forearm, a thin healed scar around its edge',
          'cracked': 'a palm-sized shattered glass screen fused flush into the skin of his bare left forearm, a thin healed scar around its edge'}
NAMES = {'seven': 'Seven (the huge ragged chimpanzee from reference image {i}; dark brown eyes; {device})',
         'grub': 'Grub (the enormous chimpanzee from reference image {i})', 'petch': 'Petch (the small young chimpanzee from '
         'reference image {i})', 'dolo': 'Dolo (the female chimpanzee from reference image {i})',
         'scientist_a': 'Dr A (the man from reference image {i})', 'scientist_b': 'Dr B (the woman from reference image {i})'}


def _val(node):
    try: return ast.literal_eval(node)
    except Exception: return None


def shots(module, listname=None):
    """[{name, place, act, dur, lines}] in play order (the module's SCENEx list if given, else SHOTS order)."""
    tree = ast.parse(open(os.path.join(BLENDER, module + '.py'), encoding='utf8').read())
    cls = {}; order = []; lists = {}
    for n in tree.body:
        if isinstance(n, ast.ClassDef):
            d = dict(name=n.name, base=n.bases[0].id if n.bases and isinstance(n.bases[0], ast.Name) else None,
                     act=ast.get_docstring(n) or '')
            for s in n.body:
                targets = [(t, s.value) for t in s.targets] if isinstance(s, ast.Assign) else []
                for t, v in targets:
                    if isinstance(t, ast.Name) and t.id in ('dur', 'lines', 'place'): d[t.id] = _val(v)
            cls[n.name] = d
        elif isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name):
            if n.targets[0].id == 'SHOTS' and isinstance(n.value, ast.List):
                order = [e.func.id for e in n.value.elts if isinstance(e, ast.Call) and isinstance(e.func, ast.Name)]
            v = _val(n.value)
            if isinstance(v, list) and all(isinstance(x, str) for x in v): lists[n.targets[0].id] = v

    def get(c, k):
        while c:
            if k in c: return c[k]
            c = cls.get(c['base'])
    names = lists.get(listname) if listname else order
    return [dict(name=k, place=get(cls[k], 'place') or 'forest', act=cls[k]['act'], dur=get(cls[k], 'dur') or 4.0,
                 lines=get(cls[k], 'lines') or []) for k in names if k in cls]


def plan(s, cast):
    """One shot -> (keyframe job, clip job). Who is in it comes from the action text and the speakers."""
    text = (s['act'] + ' ' + ' '.join(x[1] for x in s['lines'])).lower()
    who = [k for k, rx in WHO if re.search(rx, text) and os.path.exists(os.path.join(cast, f'{k}_front.jpg'))]
    if s['place'] == 'lab' and 'seven' in who and len(who) == 1 and 'people' in text: who += ['scientist_a', 'scientist_b']
    who = who[:3]
    flash = 'flash' in s['act'].lower() or 'memory' in s['act'].lower()
    cracked = s['place'] != 'lab' or re.search(r'crack|spark|white-out|smash', s['act'].lower())
    cast_txt = '; '.join(NAMES[k].format(i=i + 1, device=DEVICE['cracked' if cracked else 'intact']) for i, k in enumerate(who))
    act = re.sub(r'^(Black\. Then |White\. )', '', s['act'])                 # a keyframe is the first visible frame
    still = (f"{act} Setting: {SETS.get(s['place'], SETS['forest'])}. " + (f'In the shot: {cast_txt}. ' if who else '') +
             ('Overexposed, dreamlike memory flash, very shallow focus. ' if flash else '') +
             ('Seven is clean, not muddy. ' if s['place'] == 'lab' and 'seven' in who else '') + FILM)
    speech = ' '.join(f"{PEOPLE.get(sp, sp.capitalize()).split(',')[0]} says: \"{ln}\"" for _, sp, ln in s['lines'])
    sound = {'lab': 'Room tone: fluorescent hum, distant machines.', 'night': 'Night jungle: crickets, frogs, wind.'}.get(
        s['place'], 'Jungle ambience: birds, insects, water, leaves.')
    clip = (f"{s['act']} " + (speech + ' ' if speech else 'No dialogue. ') + 'Chimpanzees move and vocalize like real wild '
            'chimpanzees. Realistic natural motion, cinematic camera, live-action film. ' + sound + ' No music.')
    return (dict(name=s['name'], prompt=still, negative=NEG, refs=[open(os.path.join(cast, f'{k}_front.jpg'), 'rb').read()
                 for k in who], who=who, w=1280, h=720, steps=40, seed=7),
            dict(n=s['name'], prompt=clip, secs=max(3.0, min(10.0, s['dur'])), w=960, h=544, seed=11))


def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def main():
    module, cast, out = sys.argv[1:4]; os.makedirs(out, exist_ok=True)
    todo = shots(module, arg('--list'))
    if arg('--only'): todo = [s for s in todo if s['name'] in arg('--only').split(',')]
    jobs = [plan(s, cast) for s in todo]
    if '--plan' in sys.argv:
        for (k, c), s in zip(jobs, todo): print(s['name'], f"{c['secs']}s", len(k['refs']), 'refs |', k['prompt'][:150])
        return
    import modal, modal_app
    keys = [k for k, _ in jobs if not os.path.exists(os.path.join(out, k['name'] + '.jpg'))]
    clips = [c for _, c in jobs if not os.path.exists(os.path.join(out, c['n'] + '.mp4'))]
    with modal.enable_output(), modal_app.app.run():
        if keys:
            for name, data, note in modal_app.Stills().make.remote_gen(keys):
                print('key', name, note, flush=True)
                if data: open(os.path.join(out, name + '.jpg'), 'wb').write(data)
        for c in clips:
            p = os.path.join(out, c['n'] + '.jpg')
            c['image'] = open(p, 'rb').read() if os.path.exists(p) else None
        clips = [c for c in clips if c['image']]
        if clips:
            for n, data, note in modal_app.Clips().make.remote_gen(clips):
                print('clip', n, note, flush=True)
                if data: open(os.path.join(out, n + '.mp4'), 'wb').write(data)
    json.dump([dict(s, still=k['prompt'], clip=c['prompt']) for (k, c), s in zip(jobs, todo)],
              open(os.path.join(out, 'plan.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
