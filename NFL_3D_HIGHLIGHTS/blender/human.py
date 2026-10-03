"""Realistic human body for the players, generated from the CC0 MakeHuman base mesh (assets/human, see ASSET_LICENSES.md).

Pure numpy, no Blender: loads the base mesh, applies morph targets (athletic male build, ethnicity mix, and a random
but repeatable set of face details so no two players share a face), finds the skeleton joints for the Mixamo-compatible
rig, and cuts the body into what is visible (head, neck, arms) and what the uniform is modelled on ("body-topology"
garments: jersey over shoulder pads, pants, socks, gloves follow the anatomy and inherit the skin weights).

Everything is returned in the rig's rest space: centimetres, +X = the player's left, -Y = forward, +Z = up, feet at z=0.
"""
import gzip, json, os, random
import numpy as np
from utils import ASSETS

DIR = os.path.join(ASSETS, 'human'); PRE = 'mixamorig:'; NBODY = 13380
BODY_TYPES = {'skill': (0.86, 0.50), 'big': (0.96, 0.60), 'line': (0.84, 0.86)}      # (muscle, weight)
TYPE_OF = {'QB': 'skill', 'WR': 'skill', 'CB': 'skill', 'S': 'skill', 'K': 'skill', 'P': 'skill', 'RB': 'big', 'TE': 'big', 'LB': 'big', 'DL': 'line', 'OL': 'line'}
HEIGHT = 0.5; STATURE = 188.0                                                        # macro height slider; target standing height in cm
_D = {}


def smoothstep(x): x = np.clip(x, 0.0, 1.0); return x * x * (3 - 2 * x)


def data():
    """Base mesh + rig, parsed once. V in rest space (cm) before grounding."""
    if _D: return _D
    V, UV, F, FUV, FG = [], [], [], [], []; g = ''
    with gzip.open(os.path.join(DIR, 'base.obj.gz'), 'rt') as fh:
        for line in fh:
            if line.startswith('v '): x, y, z = map(float, line.split()[1:4]); V.append((x * 10, -z * 10, y * 10))
            elif line.startswith('vt '): UV.append(tuple(map(float, line.split()[1:3])))
            elif line.startswith('g '): g = line.split()[1]
            elif line.startswith('f '):
                p = [q.split('/') for q in line.split()[1:]]; F.append([int(q[0]) - 1 for q in p]); FUV.append([int(q[1]) - 1 for q in p]); FG.append(g)
    V = np.array(V, dtype=np.float64); n = len(V)
    groups = {}
    for f, name in zip(F, FG): groups.setdefault(name, set()).update(f)
    rig = json.load(open(os.path.join(DIR, 'rig.mixamo.json')))['bones']
    wj = json.load(gzip.open(os.path.join(DIR, 'weights.mixamo.json.gz'), 'rt'))['weights']
    bones = sorted(wj); W = np.zeros((n, len(bones)), dtype=np.float32)
    for bi, b in enumerate(bones):
        a = np.array(wj[b]); W[a[:, 0].astype(int), bi] = a[:, 1]
    s = W.sum(1, keepdims=True); W = W / np.where(s > 0, s, 1)
    body_f = [i for i, f in enumerate(F) if max(f) < NBODY and FG[i] == 'body']
    eye_f = [i for i, f in enumerate(F) if FG[i] in ('helper-l-eye', 'helper-r-eye')]
    _D.update(V=V, UV=np.array(UV), F=F, FUV=FUV, FG=FG, groups={k: np.array(sorted(v)) for k, v in groups.items()}, rig=rig, bones=bones, W=W, body_f=body_f, eye_f=eye_f, targets={})
    return _D


def target(name):
    d = data(); t = d['targets'].get(name)
    if t is None:
        idx, dv = [], []
        with gzip.open(os.path.join(DIR, 'targets', name + '.target.gz'), 'rt') as fh:
            for line in fh:
                p = line.split()
                if len(p) == 4 and not line.startswith('#'): idx.append(int(p[0])); dv.append((float(p[1]) * 10, -float(p[3]) * 10, float(p[2]) * 10))
        t = d["targets"][name] = (np.array(idx, dtype=int), np.array(dv, dtype=np.float64).reshape(-1, 3))
    return t


def macro(muscle, weight, race, height=HEIGHT):
    """MakeHuman macro sliders -> {target: weight} for a young adult male."""
    T = {f'{r}-male-young': w for r, w in zip(('african', 'asian', 'caucasian'), race) if w > 1e-3}
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


def morph(targets, mask=None):
    V = data()['V'].copy()
    for name, w in targets.items():
        idx, dv = target(name)
        V[idx] += dv * (w if mask is None else (w * mask[idx])[:, None])
    return V


FACE_PAIRS = ['head-scale-horiz', 'head-scale-vert', 'head-scale-depth', 'head-fat', 'nose-scale-horiz', 'nose-scale-vert', 'nose-scale-depth', 'nose-width1', 'nose-width2', 'nose-width3', 'nose-hump', 'nose-volume',
              'nose-flaring', 'nose-nostrils-width', 'nose-point-width', 'chin-width', 'chin-height', 'chin-prominent', 'chin-bones', 'chin-jaw-drop', 'mouth-scale-horiz', 'mouth-scale-vert',
              'mouth-lowerlip-volume', 'mouth-upperlip-volume', 'mouth-upperlip-height', 'mouth-lowerlip-height']
FACE_SHAPES = ['head-oval', 'head-round', 'head-rectangular', 'head-square', 'head-triangular', 'head-invertedtriangular', 'head-diamond']
FACE_SIDES = ['cheek-bones', 'cheek-volume', 'cheek-inner']
# (african, asian, caucasian) mixes with a matching skin tone (sRGB hex) — a believable, varied roster
ROSTER = [((.92, .03, .05), '#4a2c1c'), ((.85, .05, .10), '#5b3622'), ((.80, .05, .15), '#6a4129'), ((.70, .05, .25), '#7a4d31'), ((.60, .10, .30), '#8a5a3a'), ((.90, .05, .05), '#3f2618'),
          ((.05, .05, .90), '#d9a887'), ((.05, .10, .85), '#cf9a78'), ((.10, .05, .85), '#e0b394'), ((.30, .15, .55), '#b07a55'), ((.10, .70, .20), '#c99a70'), ((.45, .15, .40), '#9a6846'),
          ((.75, .05, .20), '#70452c'), ((.05, .05, .90), '#c98f6f')]


def identity(seed):
    """Repeatable per-player look: ethnicity mix, skin tone, face-detail targets, facial hair, eye colour."""
    r = random.Random(seed * 7919 + 13); race, tone = ROSTER[r.randrange(len(ROSTER))]; T = {}
    T[r.choice(FACE_SHAPES)] = r.uniform(0.25, 0.7)
    for name in r.sample(FACE_PAIRS, 11): T[f"{name}-{'incr' if r.random() < .5 else 'decr'}"] = r.uniform(0.2, 0.75)
    for name in FACE_SIDES:
        s = 'incr' if r.random() < .5 else 'decr'; w = r.uniform(0.15, 0.6)
        for side in 'lr': T[f'{side}-{name}-{s}'] = w
    dark = race[0] + race[1] > .5
    return dict(race=race, tone=tone, face=T, beard=r.choice([0, 0, 0.35, 0.6, 1.0]), brow=r.uniform(0.75, 1.0), hair='#0d0a08' if dark or r.random() < .5 else r.choice(['#2a1a10', '#4a3220', '#6b4a2a']),
                eye='#2b1a10' if dark or r.random() < .6 else r.choice(['#4a6a8a', '#5a7050', '#6a5a3a']))


def _joints(V):
    d = data(); J = {}
    for name, b in d['rig'].items():
        h = b['head']; idx = d['groups'][h['cube_name']] if h['strategy'] == 'CUBE' else np.array(h['vertex_indices'])
        J[name.replace(PRE, '')] = V[idx].mean(0)
    return J


def _normals(V, faces):
    N = np.zeros_like(V)
    for f in faces:
        p = V[f]; n = np.cross(p[1] - p[0], p[2] - p[0]) if len(f) == 3 else np.cross(p[2] - p[0], p[3] - p[1])
        N[f] += n
    L = np.linalg.norm(N, axis=1, keepdims=True); return N / np.where(L > 1e-9, L, 1)


def _rot_between(a, b):
    """Minimal rotation matrix taking direction a to direction b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(a @ b); s = np.linalg.norm(v)
    if s < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K * ((1 - c) / (s * s))


def _rot_axis(axis, ang):
    a = axis / np.linalg.norm(axis); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]]); return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * K @ K


AIM = {'Arm': ('ForeArm', (1, 0, 0)), 'ForeArm': ('Hand', (1, 0, 0)), 'Hand': ('HandMiddle1', (1, 0, 0)), 'UpLeg': ('Leg', (0, 0, -1)), 'Leg': ('Foot', (0, 0, -1))}


def repose(V, J, target_heads=None):
    """MakeHuman's rest pose (arms down, feet apart) -> the rig's T-pose, by linear blend skinning with the rig weights.
    With target_heads the limbs are also moved onto another body's joints, so every build shares one skeleton."""
    d = data(); rig = d['rig']; names = [b.replace(PRE, '') for b in d['bones']]; par = {n: rig[PRE + n]['parent'].replace(PRE, '') or None for n in names}
    order = []; seen = set()
    def visit(n):
        if n in seen: return
        if par[n]: visit(par[n])
        seen.add(n); order.append(n)
    for n in names: visit(n)
    Rw, H = {}, {}
    for n in order:
        p = par[n]; Rp = Rw[p] if p else np.eye(3); R = Rp
        side = 'Left' if n.startswith('Left') else 'Right' if n.startswith('Right') else ''; key = n[len(side):]; sgn = 1 if side == 'Left' else -1
        if side and key in AIM:
            child, tdir = AIM[key]; cur = Rp @ (J[side + child] - J[n]); tgt = np.array(tdir, float) * (np.array([sgn, 1, 1]) if tdir[0] else 1)
            R = _rot_between(cur, tgt) @ Rp
            if key == 'Hand':                                   # palms down: the knuckle line (index -> pinky) lies flat, index forward
                kn = R @ (J[side + 'HandPinky1'] - J[side + 'HandIndex1']); ang = np.arctan2(kn[2], kn[1]); R = _rot_axis(tgt, -ang) @ R
        elif side and key in ('Foot', 'ToeBase'): R = np.eye(3)
        Rw[n] = R
        H[n] = (target_heads[n] if target_heads is not None else ((Rp @ (J[n] - J[p]) + H[p]) if p else J[n]))
    out = np.zeros_like(V); W = d['W']
    for bi, n in enumerate(names):
        w = W[:, bi]; idx = np.nonzero(w)[0]
        if len(idx): out[idx] += w[idx, None] * ((V[idx] - J[n]) @ Rw[n].T + H[n])
    un = W.sum(1) < 1e-6; out[un] = V[un]
    return out, H


class Reference:
    """The shared athletic body: skeleton, garment regions and per-vertex masks. One skeleton for every player."""

    def __init__(self):
        d = data(); self.d = d; mid = (1 / 3, 1 / 3, 1 / 3)
        V = morph(macro(*BODY_TYPES['big'], mid)); V, J = repose(V, _joints(V)); self.ground = V[:NBODY, 2].min(); V[:, 2] -= self.ground
        for k in J: J[k] = J[k] - np.array([0, 0, self.ground])
        self.V = V; self.J = J; self.stature = V[:NBODY, 2].max(); self.scale = STATURE / self.stature
        F = d['F']; bones = d['bones']; W = d['W']; bi = {b.replace(PRE, ''): i for i, b in enumerate(bones)}; self.bi = bi
        wsum = lambda keys: sum(W[:, bi[k]] for k in bi if any(k.startswith(p) for p in keys))
        self.w_head = wsum(('Head', 'Neck')); self.w_arm = {s: wsum((s + 'Arm', s + 'ForeArm', s + 'Hand')) for s in ('Left', 'Right')}
        x, y, z = V[:, 0], V[:, 1], V[:, 2]; ax = np.abs(x); arm = (self.w_arm['Left'] + self.w_arm['Right']) > 0.5
        sx = J['LeftArm'][0]; ex = J['LeftForeArm'][0]; wx = J['LeftHand'][0]; belt = J['Spine'][2] - 2.5; knee = J['LeftLeg'][2]; ankle = J['LeftFoot'][2]
        self.sleeve = sx + 0.50 * (ex - sx); self.belt = belt; self.knee = knee; self.ankle = ankle; self.sx = sx; self.wx = wx
        body = np.zeros(len(V), bool); body[:NBODY] = True
        torso = body & ~arm & (self.w_head < 0.42)
        self.sets = {
            'jersey': body & (((z > belt - 4) & torso) | (arm & (ax < self.sleeve))),
            'pants': body & ~arm & (z < belt + 1.0) & (z > knee - 9.5) & (self.w_head < 0.1),
            'socks': body & ~arm & (z < knee - 2.0) & (z > ankle - 1.0),
            'gloves': body & arm & (ax > wx - 3.0),
            'feet': body & ~arm & (z < ankle + 2.5),
        }
        nb = [[] for _ in range(len(V))]
        for i in d['body_f']:
            f = F[i]
            for a in f: nb[a].extend(f)
        self.nb = [np.unique(q) if q else np.array([], int) for q in nb]
        cover = self.sets['jersey'] | self.sets['pants'] | self.sets['socks'] | self.sets['gloves'] | self.sets['feet']
        deep = cover.copy()
        for _ in range(2): deep = np.array([deep[i] and bool(deep[self.nb[i]].all()) for i in range(len(V))])
        self.skin_f = [i for i in d['body_f'] if not deep[F[i]].all()]
        self.garment_f = {k: [i for i in d['body_f'] if s[F[i]].all()] for k, s in self.sets.items() if k != 'feet'}
        # head-only morph mask (faces differ, bodies and skeleton stay shared) with a soft falloff down the neck
        self.head_mask = smoothstep((self.w_head - 0.25) / 0.6)
        # face masks from landmarks: eyebrows, beard / stubble, scalp
        le, re_ = V[d['groups']['joint-l-eye']].mean(0), V[d['groups']['joint-r-eye']].mean(0); mouth = V[d['groups']['joint-mouth']].mean(0); eye_z = (le[2] + re_[2]) / 2; ex_ = abs(le[0])
        front = smoothstep((-(y - le[1]) + 3.2) / 2.0)                                           # only the front of the face
        self.brow = smoothstep((1 - np.abs(z - (eye_z + 2.0 - 0.12 * np.abs(ax - ex_))) / 1.0) * 2.2) * smoothstep((ax - 0.8) / 0.5) * smoothstep((ex_ + 3.2 - ax) / 0.7) * front * body
        jaw = smoothstep((mouth[2] + 2.4 - z) / 1.6) * smoothstep((z - (mouth[2] - 7.5)) / 2.0) * smoothstep((-(y - mouth[1]) + 9.5) / 4.0) * (self.w_head > 0.5)
        lipgap = 1 - smoothstep(1 - np.abs(z - mouth[2]) / 1.1) * smoothstep((3.2 - ax) / 1.0) * smoothstep((-(y - mouth[1]) + 2.5) / 1.5)
        self.beard = jaw * lipgap * body; top = self.stature
        self.scalp = smoothstep((z - (eye_z + 5.2 + 0.25 * np.maximum(0, -(y - le[1]) - 4))) / 1.6) * (self.w_head > 0.6) * smoothstep(((y - le[1]) + 1.5) / 3.0 + (z - (eye_z + 6.5)) / 3.0) * body
        self.eye_c = {'l': le, 'r': re_}; self.mouth = mouth
        hv = V[:NBODY][(self.w_head[:NBODY] > 0.9) & (z[:NBODY] > J['Head'][2] + 2)]
        self.head_box = (hv.min(0), hv.max(0)); fv = V[:NBODY][self.w_head[:NBODY] > 0.6]; self.chin = fv[np.argmin(fv[:, 1] * 0.6 + fv[:, 2])]
        self.foot_box = {}
        for s, side in ((1, 'Left'), (-1, 'Right')):
            fv = V[:NBODY][(z[:NBODY] < ankle + 1) & (x[:NBODY] * s > 0)]; self.foot_box[side] = (fv.min(0), fv.max(0))

    def body(self, btype, ident=None):
        """Vertices (cm, grounded) for one player: shared body of his build + his own head."""
        mid = (1 / 3, 1 / 3, 1 / 3); T = macro(*BODY_TYPES[btype], mid); V = morph(T)
        if ident:
            hm = self.head_mask; race = ident['race']
            for r, w in zip(('african', 'asian', 'caucasian'), race):
                idx, dv = target(f'{r}-male-young'); V[idx] += dv * ((w - 1 / 3) * hm[idx])[:, None]
            for name, w in ident['face'].items():
                idx, dv = target(name); V[idx] += dv * (w * hm[idx])[:, None]
        V, _ = repose(V, _joints(V), {k: v + np.array([0, 0, self.ground]) for k, v in self.J.items()}); V[:, 2] -= self.ground
        return V

    def garment(self, name, V):
        """-> (verts, faces, uv, vert_ids, attrs) for one garment built on body topology, pushed off the skin along the normals."""
        d = self.d; F = d['F']; fs = self.garment_f[name]; ids = np.unique(np.concatenate([F[i] for i in fs])); remap = {v: k for k, v in enumerate(ids)}
        N = _normals(V, [F[i] for i in d['body_f']]); R = self.V; x, z = R[ids, 0], R[ids, 2]; ax = np.abs(x); n = N[ids]; P = V[ids].copy(); attrs = {}
        if name == 'jersey':
            top = self.J['LeftArm'][2]; t = smoothstep((z - (top - 19)) / 17.0); lat = smoothstep(ax / self.sx); arm = ax > self.sx + 1.5
            pad = 4.6 * t * (0.42 + 0.58 * lat); hem = smoothstep((self.sleeve - ax) / 6.0)
            pad = np.where(arm, 4.6 * (0.5 + 0.5 * hem), pad)
            collar = smoothstep((0.42 - self.w_head[ids]) / 0.25)                                 # ease the pads back in at the neck hole
            up = np.stack([np.sign(x) * 0.45 * lat * t, np.zeros_like(x), 0.85 * t], 1); dirn = n + up; dirn /= np.linalg.norm(dirn, axis=1, keepdims=True)
            P += n * 0.45 + dirn * (pad * (0.35 + 0.65 * collar))[:, None]
            low = smoothstep((self.belt + 1.5 - z) / 3.0); P -= n * (0.3 * low)[:, None]          # tucked under the waistband
            attrs['pad'] = t * collar
        elif name == 'pants':
            thigh = smoothstep((z - (self.knee + 6)) / 8.0) * smoothstep(((self.belt - 16) - z) / 8.0 + 1) * smoothstep(-n[:, 1] * 2)
            kneep = smoothstep(1 - np.abs(z - self.knee) / 6.0) * smoothstep(-n[:, 1] * 2); hip = smoothstep(1 - np.abs(z - (self.belt - 12)) / 7.0) * smoothstep(np.abs(n[:, 0]) * 2 - 0.6)
            P += n * (0.6 + 0.9 * thigh + 0.8 * kneep + 0.7 * hip)[:, None]
            attrs['stripe'] = smoothstep((np.abs(n[:, 0]) - 0.78) / 0.12) * (np.sign(n[:, 0]) == np.sign(x)) * smoothstep((ax - 9) / 2.0)
            attrs['belt'] = smoothstep((z - (self.belt - 3.2)) / 0.8)
        elif name == 'socks':
            P += n * 0.38; attrs['band'] = smoothstep((z - (self.knee - 15)) / 1.0)
        elif name == 'gloves':
            P += n * 0.22; attrs['cuff'] = smoothstep(((self.wx + 1.5) - ax) / 1.2)
        inset = self.sets[name]; edge = np.array([not inset[self.nb[v]].all() for v in ids])          # hem vertices: straighten the cut
        def snap(axis, value, sel):
            sel = sel & edge
            if axis == 0: P[sel, 0] += np.sign(x[sel]) * value - x[sel]
            else: P[sel, 2] += value - z[sel]
        isarm = (self.w_arm['Left'][ids] + self.w_arm['Right'][ids]) > 0.5
        if name == 'jersey': snap(0, self.sleeve, isarm)
        elif name == 'pants': snap(2, self.knee - 9.5, z < self.knee); snap(2, self.belt + 1.0, z > self.belt - 3)
        elif name == 'gloves': snap(0, self.wx - 3.0, ax < self.wx + 1)
        faces = [[remap[v] for v in F[i]] for i in fs]
        return P, faces, ids, attrs

    def jersey_uv(self, ids, faces, P):
        """Planar front / back projection into a 2:1 atlas (front on the left half, back on the right)."""
        R = self.V[ids]; x0 = 38.0; z0 = self.belt - 6.0; z1 = self.J['LeftArm'][2] + 12.0; out = []
        for f in faces:
            p = P[f]; nrm = np.cross(p[1] - p[0], p[2] - p[0]) if len(f) == 3 else np.cross(p[2] - p[0], p[3] - p[1]); front = nrm[1] < 0
            uv = []
            for v in f:
                u = (R[v, 0] + x0) / (2 * x0); u = u if front else (1 - u); uv.append(((u * 0.5) if front else (0.5 + u * 0.5), (R[v, 2] - z0) / (z1 - z0)))
            out.append(uv)
        return out, (x0, z0, z1)
