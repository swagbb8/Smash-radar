"""Driving the cloud render of the film from the sandbox (GitHub Actions workflow "Monkey shots").

    python cloud.py status [--quality preview]                 what is there (plates, runs of frames) and what is missing
    python cloud.py plates [--quality preview] [--only a,b]    start the plates that are missing
    python cloud.py frames [--quality preview] [--chunk 28] [--only a,b] [--step 1]
                                                               start the runs of frames that are missing and whose plate is there
    python cloud.py fetch <folder> [--quality preview]         bring the finished runs of frames here (one mkv each), then: post.py unpack

What the film needs comes from the cut list (post.EDL); what a shot is (its plates) from shots.py.
Results live on branches: mp/<quality>/<shot>[_f<i>] (plates) and mf/<quality>/<shot>_<first>-<last>_<step> (frames).
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
REPO = 'swagbb8/Smash-radar'; POOLS = ['ubuntu-24.04', 'ubuntu-22.04', 'ubuntu-latest']; FPS = 24


def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def sh(*a, inp=None): return subprocess.run(list(a), input=inp, text=True, capture_output=True)


def table():
    """-> {shot: dict(kind, plates [branch suffixes], frames [numbers the cut uses])}"""
    import post, shots
    need = {}
    for name, a, b in post.EDL:
        if name in shots.SHOTS: need.setdefault(name, set()).update(range(int(round(a * FPS)) + 1, int(round(b * FPS)) + 2))
    out = {}
    for name, fr in need.items():
        s = shots.SHOTS[name]; fr = sorted(f for f in fr if f <= s.frames + 1)
        out[name] = dict(kind=s.kind, plates=[s.plate_name] if s.kind == 'char' else ([f'{name}_f{i}' for i in range(len(s.focus))] if s.kind == 'focus' else [name]), frames=fr)
    return out


def branches(q):
    r = sh('git', 'ls-remote', 'origin', f'refs/heads/mp/{q}/*', f'refs/heads/mf/{q}/*'); names = [l.split('refs/heads/')[1] for l in r.stdout.splitlines() if 'refs/heads/' in l]
    return [n[len(f'mp/{q}/'):] for n in names if n.startswith('mp/')], [n[len(f'mf/{q}/'):] for n in names if n.startswith('mf/')]


def runs_of(frames, chunk):
    """Split the frame numbers a shot needs into runs of consecutive frames, none longer than `chunk`."""
    out = []; cur = []
    for f in frames:
        if cur and (f != cur[-1] + 1 or len(cur) >= chunk): out.append((cur[0], cur[-1])); cur = []
        cur.append(f)
    if cur: out.append((cur[0], cur[-1]))
    return out


def covered(shot, have, step):
    """Frame numbers of a shot already rendered, going by the names of the frame branches."""
    got = set()
    for n in have:
        if not n.startswith(shot + '_'): continue
        try: ab, st = n[len(shot) + 1:].rsplit('_', 1); a, b = (int(v) for v in ab.split('-'))
        except Exception: continue
        if int(st) == step: got.update(range(a, b + 1))
    return got


def dispatch(mode, include, q, step=1):
    for i, j in enumerate(include): j.setdefault('os', POOLS[i % len(POOLS)])
    body = json.dumps({'ref': 'main', 'inputs': {'mode': mode, 'matrix': json.dumps({'include': include}), 'quality': q, 'step': str(step)}})
    r = sh('gh', 'api', '-X', 'POST', f'repos/{REPO}/actions/workflows/monkey-shots.yml/dispatches', '--input', '-', inp=body)
    print(f'started {len(include)} {mode} jobs' if not r.returncode else 'dispatch failed: ' + (r.stdout + r.stderr)[-300:])


def main():
    cmd = sys.argv[1]; q = arg('--quality', 'preview'); step = int(arg('--step', 1)); chunk = int(arg('--chunk', 28)); only = set(arg('--only').split(',')) if arg('--only') else None
    T = table(); mp, mf = branches(q)
    if cmd == 'status':
        for name, d in T.items():
            pl = [p in mp for p in d['plates']]; got = covered(name, mf, step); miss = [f for f in d['frames'] if f not in got]
            print(f"{name:11s} {d['kind']:5s} plates {sum(pl)}/{len(pl)}   frames {len(d['frames']) - len(miss)}/{len(d['frames'])}" + (f'   missing {runs_of(miss, 10 ** 6)}' if miss and len(miss) < len(d['frames']) else ''))
    elif cmd == 'plates':
        inc = []; seen = set()
        for name, d in T.items():
            if only and name not in only: continue
            for i, p in enumerate(d['plates']):
                if (p in mp and arg('--again') != '1') or p in seen: continue
                seen.add(p); inc.append(dict(shot=p, variant='') if d['kind'] == 'char' else (dict(shot=name, variant=str(i)) if d['kind'] == 'focus' else dict(shot=name, variant='')))
        dispatch('plates', inc, q) if inc else print('no plates missing')
    elif cmd == 'frames':
        inc = []
        for name, d in T.items():
            if only and name not in only: continue
            if not all(p in mp for p in d['plates']): print(f'{name}: plate not there yet'); continue
            got = covered(name, mf, step) if arg('--again') != '1' else set(); miss = [f for f in d['frames'] if f not in got and (f - 1) % step == 0]
            for a, b in runs_of(miss, chunk if d['kind'] == 'char' else 10 ** 6): inc.append(dict(shot=name, range=f'{a}:{b}'))
        for k in range(0, len(inc), 250): dispatch('frames', inc[k:k + 250], q, step)
        if not inc: print('no frames to start')
    elif cmd == 'fetch':
        dst = os.path.abspath(sys.argv[2]); os.makedirs(dst, exist_ok=True); n = 0
        for b in mf:
            if only and not any(b.startswith(o + '_') for o in only): continue
            if any(f.startswith(b.rsplit('-', 1)[0]) for f in os.listdir(dst)) and arg('--again') != '1': continue           # already here (same shot and first frame)
            tmp = os.path.join(dst, '_tmp'); sh('rm', '-rf', tmp); r = sh('git', 'clone', '-q', '--depth', '1', '-b', f'mf/{q}/{b}', f'https://github.com/{REPO}.git', tmp)
            if r.returncode: print('could not fetch', b, r.stderr[-200:]); continue
            for f in os.listdir(tmp):
                if f.endswith('.mkv'): os.replace(os.path.join(tmp, f), os.path.join(dst, f)); n += 1
            sh('rm', '-rf', tmp)
        print(f'{n} new runs of frames in {dst}')


if __name__ == '__main__': main()
