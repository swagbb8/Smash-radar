"""The CC0 MakeHuman base mesh (assets/human): loading, morph targets, joints and the move into a T-pose.

Pure numpy, no Blender. Everything is in the rig's rest space: centimetres, +X = the character's left, -Y = forward,
+Z = up. Adapted from the body builder written for NFL_3D_HIGHLIGHTS (same author, same assets, see ASSET_LICENSES.md).
"""
import gzip, json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'assets', 'human'); PRE = 'mixamorig:'; NBODY = 13380
_D = {}


def smoothstep(x): x = np.clip(x, 0.0, 1.0); return x * x * (3 - 2 * x)
def gauss(x, s): return np.exp(-0.5 * (x / s) ** 2)


def data():
    """Base mesh + rig, parsed once."""
    if _D: return _D
    V, UV, F, FUV, FG = [], [], [], [], []; g = ''
    with gzip.open(os.path.join(DIR, 'base.obj.gz'), 'rt') as fh:
        for line in fh:
            if line.startswith('v '): x, y, z = map(float, line.split()[1:4]); V.append((x * 10, -z * 10, y * 10))
            elif line.startswith('vt '): UV.append(tuple(map(float, line.split()[1:3])))
            elif line.startswith('g '): g = line.split()[1]
            elif line.startswith('f '):
                p = [q.split('/') for q in line.split()[1:]]; F.append([int(q[0]) - 1 for q in p]); FUV.append([int(q[1]) - 1 for q in p]); FG.append(g)
    V = np.array(V, dtype=np.float64); n = len(V); groups = {}
    for f, name in zip(F, FG): groups.setdefault(name, set()).update(f)
    rig = json.load(open(os.path.join(DIR, 'rig.mixamo.json')))['bones']
    wj = json.load(gzip.open(os.path.join(DIR, 'weights.mixamo.json.gz'), 'rt'))['weights']
    bones = sorted(wj); W = np.zeros((n, len(bones)), dtype=np.float32)
    for bi, b in enumerate(bones):
        a = np.array(wj[b]); W[a[:, 0].astype(int), bi] = a[:, 1]
    s = W.sum(1, keepdims=True); W = W / np.where(s > 0, s, 1)
    names = [b.replace(PRE, '') for b in bones]; parent = {b.replace(PRE, ''): rig[b]['parent'].replace(PRE, '') or None for b in bones}
    _D.update(V=V, UV=np.array(UV), F=F, FUV=FUV, FG=FG, groups={k: np.array(sorted(v)) for k, v in groups.items()}, rig=rig, bones=names, parent=parent, W=W, targets={},
              body_f=[i for i, f in enumerate(F) if max(f) < NBODY and FG[i] == 'body'], eye_f=[i for i, f in enumerate(F) if FG[i] in ('helper-l-eye', 'helper-r-eye')],
              teeth_f=[i for i, f in enumerate(F) if FG[i] in ('helper-upper-teeth', 'helper-lower-teeth')], tongue_f=[i for i, f in enumerate(F) if FG[i] == 'helper-tongue'])
    return _D


def target(name):
    d = data(); t = d['targets'].get(name)
    if t is None:
        idx, dv = [], []
        with gzip.open(os.path.join(DIR, 'targets', name + '.target.gz'), 'rt') as fh:
            for line in fh:
                p = line.split()
                if len(p) == 4 and not line.startswith('#'): idx.append(int(p[0])); dv.append((float(p[1]) * 10, -float(p[3]) * 10, float(p[2]) * 10))
        t = d['targets'][name] = (np.array(idx, dtype=int), np.array(dv, dtype=np.float64).reshape(-1, 3))
    return t


def macro(muscle, weight, height=0.5):
    """MakeHuman macro sliders -> {target: weight} for a young adult male (even ethnic mix)."""
    T = {f'{r}-male-young': 1 / 3 for r in ('african', 'asian', 'caucasian')}
    mus = {'averagemuscle': 1 - (muscle - .5) * 2, 'maxmuscle': (muscle - .5) * 2} if muscle >= .5 else {'minmuscle': 1 - muscle * 2, 'averagemuscle': muscle * 2}
    wei = {'averageweight': 1 - (weight - .5) * 2, 'maxweight': (weight - .5) * 2} if weight >= .5 else {'minweight': 1 - weight * 2, 'averageweight': weight * 2}
    for m, a in mus.items():
        for w_, b in wei.items():
            k = a * b
            if k < 1e-3: continue
            T[f'universal-male-young-{m}-{w_}'] = k
            if height > .5: T[f'male-young-{m}-{w_}-maxheight'] = k * (height - .5) * 2
            elif height < .5: T[f'male-young-{m}-{w_}-minheight'] = k * (.5 - height) * 2
            T[f'male-young-{m}-{w_}-idealproportions'] = k * 0.8
    return T


def morph(targets):
    V = data()['V'].copy()
    for name, w in targets.items():
        idx, dv = target(name); V[idx] += dv * w
    return V


def joints(V):
    d = data(); J = {}
    for name, b in d['rig'].items():
        h = b['head']; idx = d['groups'][h['cube_name']] if h['strategy'] == 'CUBE' else np.array(h['vertex_indices'])
        J[name.replace(PRE, '')] = V[idx].mean(0)
    return J


def normals(V, faces):
    N = np.zeros_like(V)
    for f in faces:
        p = V[f]; N[f] += np.cross(p[1] - p[0], p[2] - p[0]) if len(f) == 3 else np.cross(p[2] - p[0], p[3] - p[1])
    L = np.linalg.norm(N, axis=1, keepdims=True); return N / np.where(L > 1e-9, L, 1)


def rot_between(a, b):
    """Minimal rotation matrix taking direction a to direction b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(a @ b); s = np.linalg.norm(v)
    if s < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K * ((1 - c) / (s * s))


def rot_axis(axis, ang):
    a = np.asarray(axis, float); a = a / np.linalg.norm(a); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]]); return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * K @ K


AIM = {'Arm': ('ForeArm', (1, 0, 0)), 'ForeArm': ('Hand', (1, 0, 0)), 'Hand': ('HandMiddle1', (1, 0, 0)), 'UpLeg': ('Leg', (0, 0, -1)), 'Leg': ('Foot', (0, 0, -1))}


def order():
    d = data(); out = []; seen = set()
    def visit(n):
        if n in seen: return
        if d['parent'][n]: visit(d['parent'][n])
        seen.add(n); out.append(n)
    for n in d['bones']: visit(n)
    return out


def repose(V, J):
    """MakeHuman's rest pose (arms down, feet apart) -> a T-pose (arms straight out along X, palms down, legs straight down),
    by linear blend skinning with the rig weights. -> (vertices, joint heads)"""
    d = data(); par = d['parent']; Rw, H = {}, {}
    for n in order():
        p = par[n]; Rp = Rw[p] if p else np.eye(3); R = Rp
        side = 'Left' if n.startswith('Left') else 'Right' if n.startswith('Right') else ''; key = n[len(side):]; sgn = 1 if side == 'Left' else -1
        if side and key in AIM:
            child, tdir = AIM[key]; cur = Rp @ (J[side + child] - J[n]); tgt = np.array(tdir, float) * (np.array([sgn, 1, 1]) if tdir[0] else 1)
            R = rot_between(cur, tgt) @ Rp
            if key == 'Hand':                                   # palms down: the knuckle line (index -> pinky) lies flat, index forward
                kn = R @ (J[side + 'HandPinky1'] - J[side + 'HandIndex1']); ang = np.arctan2(kn[2], kn[1]); R = rot_axis(tgt, -ang) @ R
        elif side and key in ('Foot', 'ToeBase'): R = np.eye(3)
        Rw[n] = R; H[n] = (Rp @ (J[n] - J[p]) + H[p]) if p else J[n]
    out = np.zeros_like(V); W = d['W']
    for bi, n in enumerate(d['bones']):
        w = W[:, bi]; idx = np.nonzero(w)[0]
        if len(idx): out[idx] += w[idx, None] * ((V[idx] - J[n]) @ Rw[n].T + H[n])
    un = W.sum(1) < 1e-6; out[un] = V[un]
    return out, H
