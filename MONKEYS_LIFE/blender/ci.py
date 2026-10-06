"""Rendering on GitHub runners. Everything arrives as environment variables so free text never touches a shell.

    python ci.py plan      ML_JOBS = JSON list of {"name": ..., "args": "..."}  ->  the job matrix
    python ci.py still     ML_NAME, ML_ARGS  ->  out/<name>.png  (studio.py does the work)
"""
import json, os, re, shlex, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def plan():
    """(kept for hand use) ML_JOBS: a JSON list of jobs -> the matrix object the workflow wants as its `matrix` input"""
    jobs = json.loads(os.environ.get('ML_JOBS') or '[]'); print(json.dumps({'include': [dict(name=str(j.get('name') or f'still{i}'), args=str(j.get('args', '')), tool=str(j.get('tool', 'studio'))) for i, j in enumerate(jobs)]}))


def still():
    name = re.sub(r'[^A-Za-z0-9_-]+', '-', os.environ['ML_NAME'])[:60]; tool = os.environ.get('ML_TOOL') or 'studio'
    if tool not in ('studio', 'sheet', 'swamp', 'shot', 'witness', 'motion', 'plate'): sys.exit('unknown tool')
    os.makedirs('out', exist_ok=True); out = os.path.abspath(os.path.join('out', name + '.png')); args = shlex.split(os.environ.get('ML_ARGS', ''))
    if tool in ('shot', 'witness', 'motion', 'plate'):                                                  # one moment of a shot (plate + Seven), or the fast flat views of it:  args = "<shot> --at 3.4 --quality preview ..."
        import glob, shutil, time
        tmp = os.path.abspath('shot_tmp'); t0 = time.time(); mode = {'shot': 'still', 'witness': 'witness', 'motion': 'sheet', 'plate': 'plate'}[tool]
        r = subprocess.run([sys.executable, os.path.join(HERE, 'render.py'), mode, args[0], tmp, *args[1:]], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        got = sorted(p for p in glob.glob(os.path.join(tmp, '*.png')) if not os.path.basename(p).startswith('_'))
        for p in got:
            if tool == 'plate': shutil.copy(p, out)
            elif p.endswith('_plate.png'): shutil.copy(p, out.replace('.png', '_plate.png'))
            else: shutil.copy(p, out)
        r.stdout += f'\nrendered {out} in {time.time() - t0:.0f}s ({os.cpu_count()} cores)\n'
    else: r = subprocess.run([sys.executable, os.path.join(HERE, tool + '.py'), out, *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    tail = [l for l in r.stdout.splitlines() if not l.startswith('Fra:')][-25:]; print('\n'.join(tail))
    if r.returncode or not os.path.exists(out): print('::error::' + ' | '.join(tail[-6:])[:900]); sys.exit(1)
    done = [l for l in tail if l.startswith('rendered ')]                    # the timing line, kept where the sandbox can read it (it cannot fetch logs)
    if done: print('::notice::' + done[-1].replace(out, name)); open(os.path.join('out', name + '.txt'), 'w').write(done[-1].replace(out, name) + '\n')


SAFE = lambda v: re.sub(r'[^A-Za-z0-9_.:-]+', '', str(v or ''))


def _git(*a, cwd=None, check=True): return subprocess.run(['git', *a], cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=check)


def _fetch(branch, into):
    """Files kept on a branch of this repository -> a folder (nothing if the branch is not there)."""
    tmp = os.path.abspath('_fetch'); subprocess.run(['rm', '-rf', tmp]); r = _git('clone', '-q', '--depth', '1', '-b', branch, os.environ['ML_REPO'], tmp, check=False)
    if r.returncode: return False
    os.makedirs(into, exist_ok=True)
    for f in os.listdir(tmp):
        if f != '.git': os.replace(os.path.join(tmp, f), os.path.join(into, f))
    return True


def film():
    """One job of the "Monkey shots" workflow. ML_MODE plates: ML_SHOT [ML_VARIANT]. ML_MODE frames: ML_SHOT ML_RANGE (a:b) ML_STEP. ML_QUALITY for both."""
    sys.path.insert(0, HERE); mode = SAFE(os.environ['ML_MODE']); shot = SAFE(os.environ['ML_SHOT']); q = SAFE(os.environ.get('ML_QUALITY') or 'preview'); out = os.path.abspath('film_out'); os.makedirs(out, exist_ok=True); os.makedirs('keep', exist_ok=True)
    run = lambda *a: subprocess.run([sys.executable, os.path.join(HERE, 'render.py'), *a], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    note = lambda r: print('\n'.join([l for l in r.stdout.splitlines() if not l.startswith(('Fra:', 'EGL')) and 'Saved:' not in l][-30:]))
    if mode == 'plates':
        v = SAFE(os.environ.get('ML_VARIANT')); r = run('plate', shot, out, '--quality', q, *(['--variant', v] if v else [])); note(r)
        got = [f for f in os.listdir(out) if f.endswith(('.exr', '.png'))]
        for f in got: os.replace(os.path.join(out, f), os.path.join('keep', f))
        open('keep_branch.txt', 'w').write(f'mp/{q}/{shot}' + (f'_f{v}' if v else ''))
        if r.returncode or not got: print('::error::' + ' | '.join(r.stdout.splitlines()[-6:])[:900]); sys.exit(1)
        return
    a, b = (int(x) for x in SAFE(os.environ['ML_RANGE']).split(':')); step = int(SAFE(os.environ.get('ML_STEP') or 1)); open('keep_branch.txt', 'w').write(f'mf/{q}/{shot}_{a:04d}-{b:04d}_{step}')
    import importlib
    try:
        import bpy                                                                                # only to read the shot table without building anything
        shots = importlib.import_module('shots'); sh = shots.SHOTS[shot]; names = [f'{sh.plate_name}'] if sh.kind == 'char' else ([f'{shot}_f{i}' for i in range(len(sh.focus))] if sh.kind == 'focus' else [shot])
    except Exception as e: print('::error::cannot read the shot table: ' + str(e)[:300]); sys.exit(1)
    for n in names:
        if not _fetch(f'mp/{q}/{n}', out): print(f'::error::the plate mp/{q}/{n} is not there: run the plates first'); sys.exit(1)
    r = run('frames', shot, out, '--quality', q, '--range', f'{a}:{b}', '--step', str(step)); note(r); d = os.path.join(out, shot); have = sorted(f for f in os.listdir(d) if f.startswith('f') and f.endswith('.png')) if os.path.isdir(d) else []
    if have:                                                                                      # pack what was rendered (even if it stopped part way): frames a, a+step, ... in order
        lst = os.path.join(out, 'list.txt'); open(lst, 'w').write(''.join(f"file '{os.path.join(d, f)}'\nduration {1 / 24}\n" for f in have)); last = int(have[-1][1:5])
        mk = os.path.join('keep', f'{shot}_{a:04d}-{last:04d}_{step}.mkv')
        e = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-vsync', 'passthrough', '-c:v', 'libx264', '-preset', 'slow', '-crf', '9', '-pix_fmt', 'yuv444p10le', mk], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if e.returncode: print('::error::ffmpeg: ' + e.stdout[-500:]); sys.exit(1)
        times = [l for l in r.stdout.splitlines() if l.startswith('frame ') or ': frames ' in l]; print(f'::notice::{shot} {a}:{last} step {step}: {len(have)} frames; ' + (times[-1] if times else ''))
    if r.returncode or len(have) < len(range(a, b + 1, step)): print('::error::' + ' | '.join(r.stdout.splitlines()[-6:])[:900]); sys.exit(1)


def keep():
    """Whatever is in keep/ goes onto its own branch (named in keep_branch.txt), replacing what was there. No clone, so many jobs can do it at once."""
    if not os.path.exists('keep_branch.txt') or not os.listdir('keep'): print('nothing to keep'); return
    br = open('keep_branch.txt').read().strip(); _git('init', '-q', '-b', 'k', cwd='keep'); _git('config', 'user.name', 'monkey-bot', cwd='keep'); _git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com', cwd='keep')
    _git('add', '-A', cwd='keep'); _git('commit', '-qm', br, cwd='keep')
    for attempt in range(6):
        r = _git('push', '-q', '-f', os.environ['ML_REPO'], f'k:refs/heads/{br}', cwd='keep', check=False)
        if not r.returncode: print('kept on', br); return
        import time; time.sleep(3 + attempt * 4)
    print('::error::could not keep ' + br); sys.exit(1)


if __name__ == '__main__': {'plan': plan, 'still': still, 'film': film, 'keep': keep}[sys.argv[1]]()
