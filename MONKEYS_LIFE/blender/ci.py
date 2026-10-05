"""Rendering on GitHub runners. Everything arrives as environment variables so free text never touches a shell.

    python ci.py plan      ML_JOBS = JSON list of {"name": ..., "args": "..."}  ->  the job matrix
    python ci.py still     ML_NAME, ML_ARGS  ->  out/<name>.png  (studio.py does the work)
"""
import json, os, re, shlex, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def plan():
    jobs = json.loads(os.environ.get('ML_JOBS') or '[]'); inc = []
    for i, j in enumerate(jobs):
        name = re.sub(r'[^A-Za-z0-9_-]+', '-', str(j.get('name') or f'still{i}'))[:60]; inc.append(dict(name=name, args=str(j.get('args', '')), tool=str(j.get('tool', 'studio'))))
    if not inc: sys.exit('ML_JOBS is empty')
    with open(os.environ.get('GITHUB_OUTPUT', '/dev/stdout'), 'a') as f: f.write('matrix=' + json.dumps({'include': inc}) + '\n')


def still():
    name = os.environ['ML_NAME']; tool = os.environ.get('ML_TOOL') or 'studio'
    if tool not in ('studio', 'sheet', 'shot'): sys.exit('unknown tool')
    os.makedirs('out', exist_ok=True); out = os.path.abspath(os.path.join('out', name + '.png'))
    r = subprocess.run([sys.executable, os.path.join(HERE, tool + '.py'), out, *shlex.split(os.environ.get('ML_ARGS', ''))], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    tail = [l for l in r.stdout.splitlines() if not l.startswith('Fra:')][-25:]; print('\n'.join(tail))
    if r.returncode or not os.path.exists(out): print('::error::' + ' | '.join(tail[-6:])[:900]); sys.exit(1)
    done = [l for l in tail if l.startswith('rendered ')]                    # the timing line, kept where the sandbox can read it (it cannot fetch logs)
    if done: print('::notice::' + done[-1].replace(out, name)); open(os.path.join('out', name + '.txt'), 'w').write(done[-1].replace(out, name) + '\n')


if __name__ == '__main__': {'plan': plan, 'still': still}[sys.argv[1]]()
