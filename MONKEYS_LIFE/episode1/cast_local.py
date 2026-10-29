"""The cast as photoreal stills, run from the laptop on Modal (uses ~/.modal.toml; no GitHub secrets).

Every front portrait comes from text only: the 3D renders are not used as references any more (they dragged the look
toward the Blender chimp). Other views are edits of each front so the individual stays the same.
    python cast_local.py <out folder> [--only seven,grub]
"""
import json, os, sys
import modal
import modal_app
from ep import CHAR

PHOTO = ('Real wildlife photograph, National Geographic, shot on a full-frame camera with an 85mm lens, natural light, '
         'sharp focus on the eyes, individual hairs visible, wet catchlights in the eyes. No text, no watermark.')
NEG = 'cartoon, 3d render, cgi, plastic, doll, mask, painting, illustration, human face, blurry, deformed, extra limbs, text'
FRONT = {
    'seven': CHAR['S'].split(' — ', 1)[1] + '. His left forearm rests across his chest: embedded INTO the flesh of that '
             'forearm, halfway between wrist and elbow, is a flat palm-sized implant with a cracked black glass screen, '
             'sitting flush with the skin, puckered scar tissue grown over its edges, no strap, no band',
    'grub': CHAR['G'].split(' — ', 1)[1],
    'petch': CHAR['P'].split(' — ', 1)[1],
    'dolo': CHAR['D'].split(' — ', 1)[1],
}
VIEWS = [
    ('full', 'The same chimpanzee, full body, knuckle-walking on a mossy log in a dim rainforest, side view.'),
    ('angle', 'The same chimpanzee sitting on a branch, three-quarter view, looking off to the side.'),
]


def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(FRONT)
    jobs = []
    for k in [k for k in only if k in FRONT]:
        jobs.append(dict(name=f'{k}/front', prompt=f'Wildlife portrait photograph of {FRONT[k]}. Chest-up, facing the '
                         f'camera, dim green rainforest behind. {PHOTO}', negative=NEG, refs=[], w=1024, h=1280,
                         steps=50, seed=3))
    for k, who in (('scientist_a', 'a tired man in his fifties, a research scientist in a white lab coat and glasses'),
                   ('scientist_b', 'a sharp woman in her thirties, a research scientist in a white lab coat, hair tied back')):
        if '--only' in sys.argv and k not in only: continue
        jobs.append(dict(name=f'{k}/front', prompt=f'Film still, live-action movie: portrait of {who}, chest-up, in a '
                         'sterile white laboratory under cold fluorescent light. Photoreal, 85mm lens, real skin texture. '
                         'No text.', negative=NEG, refs=[], w=1024, h=1280, steps=50, seed=3))
    for k in only:
        if k not in FRONT: continue
        for view, text in VIEWS:
            jobs.append(dict(name=f'{k}/{view}', prompt=f'{text} {PHOTO}', negative=NEG, refs=[f'@{k}/front'],
                             w=1024, h=1280, steps=40, seed=3))
    if 'seven' in only:
        jobs.append(dict(name='seven/arm', prompt='Close-up of the same chimpanzee\'s left forearm: the palm-sized '
                         'device under the skin, its small shattered glass screen, the healed scar around it. Real macro '
                         'photograph, natural light. No text.', negative=NEG, refs=['@seven/front'], w=1280, h=1024,
                         steps=40, seed=3))
    made = {}
    with modal.enable_output(), modal_app.app.run():
        for name, data, note in modal_app.Stills().make.remote_gen(jobs):
            print('cast', name, note, flush=True)
            if data:
                f = name.replace('/', '_') + '.jpg'; open(os.path.join(out, f), 'wb').write(data); made[name] = f
                json.dump(made, open(os.path.join(out, 'cast.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
