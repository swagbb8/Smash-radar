"""One scene of Episode 1 as AI footage on Kaggle: keyframes (Qwen-Image-Edit + cast refs) then clips (Wan2.2 5B).
    python scene_kaggle.py <blender module> <list> <cast folder> <out folder> [--only B01,B02] [--keys-only] [--clips-only] [--big = Wan 14B]
Shots come from ../blender/<module>.py through ai_scene.shots(); <out>/<shot>.jpg and .mp4 already there are skipped.
"""
import json, os, shutil, sys, tempfile, time
import ai_scene, kaggle_run, keyfix


def main():
    module, listname, cast, out = sys.argv[1:5]; os.makedirs(out, exist_ok=True)
    todo = ai_scene.shots(module, listname)
    only = ai_scene.arg('--only')
    if only: todo = [s for s in todo if s['name'] in only.split(',')]
    keys, clips = [], []
    for s in todo:
        k, c = ai_scene.plan(s, cast)
        keys.append(dict(name=k['name'], prompt=k['prompt'], refs=[f'{w}_front.jpg' for w in k['who']], w=1280, h=720, seed=7))
        clips.append(dict(name=c['n'], prompt=c['prompt'], secs=min(c['secs'], 5.0), w=832, h=480, steps=30, seed=11))
    model = {'keys': 'Qwen-Image-Edit (NF4, 8-step)', 'clips': 'Wan2.2-TI2V-5B', 'clips14': 'Wan2.2-I2V-A14B GGUF Q4_K_M + Lightning 4-step'}
    def record(kind, jobs):                                   # what made each output: <out>/<shot>.<kind>.json
        for j in jobs:
            json.dump(dict(j, model=model[kind], when=time.strftime('%Y-%m-%d %H:%M')), open(os.path.join(out, f"{j.get('name') or j.get('n')}.{kind}.json"), 'w'), indent=1)
    if '--clips-only' not in sys.argv:
        need = [k for k in keys if not os.path.exists(os.path.join(out, k['name'] + '.jpg'))]
        if need:
            record('keys', need); kaggle_run.run('keys', need, out, keys=cast)
            for k in need:
                f = os.path.join(out, k['name'] + '.jpg')
                if os.path.exists(f) and 'seven' in ' '.join(k['refs']): keyfix.despeckle(f)
    if '--keys-only' in sys.argv: return
    need = [c for c in clips if not os.path.exists(os.path.join(out, c['name'] + '.mp4'))
            and os.path.exists(os.path.join(out, c['name'] + '.jpg'))]
    if need:
        with tempfile.TemporaryDirectory() as d:
            for c in need: shutil.copy(os.path.join(out, c['name'] + '.jpg'), d)
            kind = 'clips14' if '--big' in sys.argv else 'clips'; record(kind, need)
            kaggle_run.run(kind, need, out, keys=d)


if __name__ == '__main__':
    main()
