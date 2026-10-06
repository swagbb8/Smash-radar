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


if __name__ == '__main__': {'plan': plan, 'still': still}[sys.argv[1]]()
