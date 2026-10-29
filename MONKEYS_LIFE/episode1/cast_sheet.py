"""Seven's character sheet: the same chimp as cast/seven_front.jpg from more views, so wide shots get his real body.
    python cast_sheet.py <cast folder> <out folder>
Approved views are copied into the cast folder by hand and listed in ai_scene.REFS.
"""
import os, sys
import kaggle_run

SEVEN = ('the exact same chimpanzee as in the reference image: same face, same grey-white chin beard, same scars, same ears. '
         'A huge, ragged adult male chimpanzee, bigger and more powerfully built than a normal chimp, long arms, heavy shoulders, '
         'dry matte black fur, dark brown eyes. A palm-sized dark glass screen is fused flush into the skin of his bare left '
         'forearm, a thin healed scar around its edge. ')
LOOK = ('Plain mid-grey studio backdrop, soft even key light from the front left, sharp focus, realistic wildlife photograph, '
        'real fur and skin, no text.')
VIEWS = {
    'seven_body': 'Full body, standing on all fours in a knuckle-walk, side-on three-quarter view, the whole animal in frame.',
    'seven_stool': 'Full body, sitting upright on a metal lab stool, hands resting on his knees, facing the camera.',
    'seven_34': 'Head and shoulders, turned three-quarters to his right, calm, looking past the camera.',
    'seven_profile': 'Head and shoulders in exact side profile, facing left.',
}


def main():
    cast, out = sys.argv[1:3]
    jobs = [dict(name=k, prompt=f'{v} {SEVEN}{LOOK}', refs=['seven_front.jpg'], w=1024, h=1024, seed=7) for k, v in VIEWS.items()]
    kaggle_run.run('keys', jobs, out, slug='ml-cast', keys=cast, wait=False)


if __name__ == '__main__':
    main()
