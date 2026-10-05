"""Seven's body: a chimpanzee sculpted out of the CC0 MakeHuman base mesh, in numpy.

    human base  ->  heavy muscular build  ->  ape face (MakeHuman's own face sliders pushed past human limits, then a
    sculpted muzzle, brow ridge, low sloping skull and big ears)  ->  ape proportions (long arms, short legs, barrel
    chest, no neck)  ->  maps for the fur, the bare skin and the device in his left forearm.

Rest space: centimetres, +X = his left, -Y = forward, +Z = up, T-pose, feet on z = 0.
"""
import numpy as np
import basemesh as bm
import device
from basemesh import smoothstep, gauss, NBODY

# MakeHuman face sliders, pushed toward an ape (values above 1 leave the human range on purpose)
FACE = {
    'forehead-trans-backward': 1.3, 'forehead-scale-vert-decr': 1.0, 'forehead-temple-decr': 0.6, 'eyebrows-trans-forward': 0.75, 'eyebrows-trans-down': 1.0, 'eyebrows-angle-down': 0.3,
    'nose-scale-depth-decr': 1.3, 'nose-trans-backward': 0.5, 'nose-flaring-incr': 1.2, 'nose-nostrils-width-incr': 1.2, 'nose-width1-incr': 0.8, 'nose-width2-incr': 1.0, 'nose-width3-incr': 1.0,
    'nose-scale-vert-decr': 0.9, 'nose-point-up': 0.6, 'nose-hump-decr': 1.0, 'nose-greek-incr': 0.6, 'nose-nostrils-angle-up': 0.6, 'nose-volume-decr': 0.5,
    'mouth-scale-horiz-incr': 1.6, 'mouth-trans-forward': 1.2, 'mouth-upperlip-volume-decr': 2.0, 'mouth-lowerlip-volume-decr': 1.7, 'mouth-upperlip-height-incr': 1.0, 'mouth-scale-vert-decr': 0.5,
    'mouth-trans-down': 0.9, 'mouth-cupidsbow-decr': 1.0, 'mouth-philtrum-volume-decr': 1.0, 'mouth-angles-down': 0.35,
    'chin-prominent-decr': 1.2, 'chin-height-decr': 0.8, 'chin-width-incr': 1.0, 'chin-bones-incr': 0.8, 'chin-prognathism-incr': 0.9, 'chin-cleft-decr': 1.0,
    'head-scale-depth-incr': 0.5, 'head-fat-incr': 0.0, 'head-square': 0.35,
    'measure-neck-circ-incr': 1.6, 'neck-scale-depth-incr': 1.0, 'neck-scale-horiz-incr': 1.0, 'neck-back-scale-depth-incr': 1.0,
}
for side in 'lr':
    FACE.update({f'{side}-ear-scale-incr': 0.5, f'{side}-ear-wing-incr': 1.0, f'{side}-ear-shape-round': 0.7, f'{side}-ear-flap-incr': 0.6, f'{side}-ear-lobe-decr': 1.0,
                 f'{side}-eye-scale-incr': 0.5, f'{side}-eye-trans-in': 0.45, f'{side}-eye-height2-incr': 0.6, f'{side}-eye-push1-in': 0.6, f'{side}-eye-push2-in': 0.6, f'{side}-eye-bag-incr': 0.7, f'{side}-eye-eyefold-down': 0.5,
                 f'{side}-cheek-bones-incr': 0.8, f'{side}-cheek-volume-decr': 0.6, f'{side}-cheek-inner-decr': 0.4})

# the eyeball: where the clear cornea ends (angle from the line of sight, radians), how far it bulges (fraction of the radius), pupil size (fraction of the iris)
EYE = dict(limbus=0.47, bulge=0.085, pupil=0.40)

# ape proportions as per-bone scale along world X, Y, Z in the T-pose (arms run along X, legs and spine along Z, feet along Y)
PROP = {
    'Hips': (1.16, 1.22, 1.00), 'Spine': (1.22, 1.38, 1.00), 'Spine1': (1.26, 1.42, 1.03), 'Spine2': (1.30, 1.40, 1.06),
    'Neck': (1.30, 1.34, 0.42), 'Head': (1.24, 1.24, 1.24),
    'Shoulder': (1.14, 1.34, 1.34), 'Arm': (1.20, 1.60, 1.60), 'ForeArm': (1.26, 1.54, 1.54), 'Hand': (1.18, 1.30, 1.34),
    'Finger': (1.28, 1.22, 1.22), 'Thumb': (0.84, 1.12, 1.12),
    'UpLeg': (1.26, 1.26, 0.72), 'Leg': (1.20, 1.20, 0.74), 'Foot': (1.22, 1.22, 1.00), 'ToeBase': (1.22, 1.36, 1.00),
}


def _prop(name):
    key = name.replace('Left', '').replace('Right', '')
    if key.startswith('HandThumb'): key = 'Thumb'
    elif key.startswith('Hand') and key != 'Hand': key = 'Finger'
    return np.array(PROP.get(key, (1, 1, 1)), float)


def _landmarks(V):
    G = bm.data()['groups']; idx = lambda t: bm.target(t)[0]
    eye = {s: V[G[f'joint-{s}-eye']].mean(0) for s in 'lr'}; nose = V[idx('nose-volume-incr')]; mouth = V[idx('mouth-upperlip-volume-decr')]; chin = V[idx('chin-prominent-incr')]
    return dict(eye=eye, eye_z=(eye['l'][2] + eye['r'][2]) / 2, eye_y=min(eye['l'][1], eye['r'][1]), nose_tip=nose[np.argmin(nose[:, 1])], nose_base=nose[:, 2].min(), lips_z=float(np.median(mouth[:, 2])),
                lips_y=float(mouth[:, 1].min()), chin_z=float(chin[:, 2].min()), top=float(V[:NBODY, 2].max()), ear={s: idx(f'{s}-ear-scale-incr') for s in 'lr'})


def _neighbours(n, faces):
    """Vertex adjacency as a row-normalised sparse matrix (each row averages a vertex's edge neighbours)."""
    from scipy import sparse
    a, b = [], []
    for f in faces:
        k = len(f)
        for i in range(k): a.append(f[i]); b.append(f[(i + 1) % k])
    a = np.array(a); b = np.array(b); A = sparse.coo_matrix((np.ones(len(a) * 2), (np.concatenate([a, b]), np.concatenate([b, a]))), shape=(n, n)).tocsr(); A.data[:] = 1.0
    deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1; return sparse.diags(1.0 / deg) @ A


def relax(V, weight, rounds=3, amount=0.5):
    """Laplacian smoothing of the body skin where weight > 0 (rounds off pinches and shelves left by big moves)."""
    d = bm.data()
    if 'adj' not in d: d['adj'] = _neighbours(len(d['V']), [d['F'][i] for i in d['body_f']])
    A = d['adj']; out = V.copy(); w = (np.clip(weight, 0, 1) * amount)[:, None]
    for _ in range(rounds): out = out + w * (A @ out - out)
    return out


def region(name, n=None):
    """Soft mask of a facial feature, read off a MakeHuman 'move the whole feature' slider (1 on the feature, fading at its edge)."""
    idx, dv = bm.target(name); m = np.zeros(n or len(bm.data()['V'])); mag = np.linalg.norm(dv, axis=1); m[idx] = mag / mag.max(); return m


def _sculpt_head(V, wh):
    """Muzzle, brow ridge, low sloping skull, big ears. Applied to head vertices only (wh = head weight), eyeballs kept round."""
    d = bm.data(); G = d['groups']; L = _landmarks(V); out = V.copy(); x, y, z = V[:, 0], V[:, 1], V[:, 2]; ax = np.abs(x); body = np.arange(len(V)) < NBODY
    front = smoothstep((L['eye_y'] + 7.5 - y) / 6.0)                                   # 1 on the face, 0 behind the ears
    zb = L['eye_z'] + 2.3                                                               # brow line
    # 1. skull: lower it and slope it straight back from the brow
    up = np.maximum(0, z - zb); t = smoothstep(up / (L['top'] - zb)); dz = -up * 0.19 * (0.4 + 0.6 * front); dy = 0.30 * up * front * (1 - 0.35 * t)
    # 2. brow ridge: one heavy rounded bar across both eyes, low enough to hood them
    brow = gauss(z - (zb - 0.45), 1.5) * smoothstep((7.8 - ax) / 2.6) * front; dy -= 0.72 * brow; dz -= 0.12 * brow
    # 3. muzzle: the whole lower face comes forward as one rounded mass that flows into the cheeks
    zm = L['lips_z'] + 1.0; span = (L['eye_z'] - 1.6) - L['chin_z']
    vert = smoothstep((L['eye_z'] - 1.2 - z) / 3.4) * smoothstep((z - (L['chin_z'] - 1.5)) / 3.0)      # from under the eyes to the chin
    side = np.cos(np.pi / 2 * np.clip(ax / 7.3, 0, 1)) ** 1.1
    m = vert * side * front; bulge = 0.75 + 0.25 * gauss(z - zm, span * 0.32)
    dy -= 4.5 * m * bulge; dxm = x * 0.20 * m                                           # forward and wider
    # 3a. a chimp's muzzle is a blunt barrel, not a dog's wedge: fuller above the mouth, the lips drawn back
    mid = smoothstep((6.0 - ax) / 3.0) * front
    dy -= 0.80 * gauss(z - (L['eye_z'] - 4.4), 1.8) * mid; dy += 1.05 * gauss(z - (L['eye_z'] - 8.3), 1.25) * mid
    # 3b. a wide mouth: the lip line is stretched sideways across the muzzle
    wide = gauss(z - L['lips_z'], 1.7) * smoothstep((6.6 - ax) / 3.4) * front; dxm = dxm + x * 0.30 * wide
    # 4. no chin: under the lips the jaw falls back and tucks up
    under = smoothstep((L['lips_z'] - 1.6 - z) / 2.6) * smoothstep((4.5 - ax) / 2.0) * front; dy += 1.5 * under; dz += 0.5 * under * smoothstep((L['chin_z'] + 2.5 - z) / 2.5)
    # 5. upper lip long and flat, nose pressed onto the muzzle
    nose = gauss(z - (L['nose_tip'][2] + 0.2), 1.3) * smoothstep((2.4 - ax) / 1.2) * smoothstep((L['nose_tip'][1] + 2.6 - y) / 2.2); dy += 1.25 * nose
    # 6. heavier jaw line
    jaw = gauss(z - (L['chin_z'] + 3.2), 2.6) * smoothstep((ax - 3.0) / 2.5) * smoothstep((L['eye_y'] + 9.5 - y) / 5.0); dxj = np.sign(x) * 0.75 * jaw
    k = smoothstep((wh - 0.45) / 0.4)                                                    # fade out down the neck
    out[:, 0] += (dxm + dxj - x * 0.07 * t) * k; out[:, 1] += dy * k; out[:, 2] += dz * k
    # round off what the big moves left sharp: the brow shelf, and the step between muzzle and cheek (lids, lips and nose keep their edges)
    keep = np.maximum(region('nose-trans-up', len(V)), 0.0)
    for tname in ('mouth-upperlip-volume-decr', 'mouth-lowerlip-volume-decr'): keep[bm.target(tname)[0]] = 1
    for s in 'lr':
        c = L['eye'][s]; keep = np.maximum(keep, smoothstep((3.0 - np.linalg.norm(V - c, axis=1)) / 0.8))
    w_brow = front * smoothstep((z - (L['eye_z'] + 1.25)) / 0.9)
    w_cheek = front * smoothstep((ax - 2.2) / 1.6) * smoothstep((L['eye_z'] - 0.6 - z) / 1.5) * smoothstep((z - (L['chin_z'] - 1.0)) / 1.5)
    out = relax(out, np.maximum(w_brow, w_cheek * (1 - keep)) * k * body, rounds=5, amount=0.6)
    out = relax(out, region('nose-trans-up', len(V)) * smoothstep((L['eye_z'] - 0.9 - z) / 1.6) * k * body, rounds=40, amount=0.7)      # the human nose melts into the muzzle
    # 7. ears: bigger and standing out from the skull, grown from where they attach so the skull around them stays put
    for s in 'lr':
        w = region(f'{s}-ear-trans-up', len(V)); ring = (w > 0.02) & (w < 0.6); root = V[ring].mean(0); sgn = 1 if s == 'l' else -1
        out += ((out - (root + (out[ring] - V[ring]).mean(0))) * 0.10 + np.array([sgn * 0.45, 0.15, 0.1])) * w[:, None]
    # eyeballs stay rigid: move each with the skin around it, do not stretch it
    for s in 'lr':
        gi = G[f'helper-{s}-eye']; lids = np.concatenate([G[f'joint-{s}-upperlid'], G[f'joint-{s}-lowerlid']]); out[gi] = V[gi] + (out[lids] - V[lids]).mean(0) * np.array([1, 0.55, 1])
    for gname, lift in (('helper-upper-teeth', 0.0), ('helper-lower-teeth', 0.15), ('helper-tongue', 0.1)):                 # teeth and tongue sit well inside the closed mouth
        gi = G[gname]; out[gi, 0] *= 0.80; out[gi, 1] += 0.95; out[gi, 2] += lift
    nostril = np.zeros(len(V))
    L['nostril'] = nostril; L['muzzle'] = m * k
    return out, L


def _reproportion(V, J):
    """Scale every bone's part of the body along the T-pose axes and move the joints with it (linear blend skinning)."""
    d = bm.data(); par = d['parent']; H = {}
    for n in bm.order():
        p = par[n]; H[n] = (H[p] + _prop(p) * (J[n] - J[p])) if p else J[n].copy()
    out = np.zeros_like(V); W = d['W']
    for bi, n in enumerate(d['bones']):
        w = W[:, bi]; idx = np.nonzero(w)[0]
        if len(idx): out[idx] += w[idx, None] * ((V[idx] - J[n]) * _prop(n) + H[n])
    un = W.sum(1) < 1e-6; out[un] = V[un]
    return out, H


def _rot_x(p, c, ang):
    """Rotate points p about the X axis through c by per-point angles (radians)."""
    q = p - c; ca, sa = np.cos(ang), np.sin(ang); out = q.copy(); out[:, 1] = q[:, 1] * ca - q[:, 2] * sa; out[:, 2] = q[:, 1] * sa + q[:, 2] * ca; return out + c


def _face_shapes(V, ids, eye, J, G):
    """Shape keys built on the finished head: Blink (lids roll over the eyeball), JawOpen, BrowUp, BrowDown. -> {name: (n, 3) offsets}"""
    out = {}; body = np.arange(len(V)) < NBODY; hs = _prop('Head')[0]
    # blink: every lid vertex turns about the eyeball's horizontal axis, the upper lid most of the way, the lower lid a little
    blink = np.zeros_like(V)
    for s in 'lr':
        c = eye[s]; r = np.linalg.norm(V[G[f'helper-{s}-eye']] - c, axis=1).mean(); q = V - c; dist = np.linalg.norm(q, axis=1)
        phi = np.arctan2(q[:, 2], -q[:, 1])                                             # elevation seen from inside the eye: 0 = straight ahead, + up
        near = smoothstep((r * 2.1 - dist) / (r * 0.9)) * smoothstep((-q[:, 1] - r * 0.15) / (r * 0.5)) * smoothstep((r * 1.55 - np.abs(q[:, 0])) / (r * 0.5)) * body
        meet = -0.16                                                                    # where the lids meet, a little below the middle
        upper = phi > meet; fall_u = smoothstep((1.25 - phi) / 0.7); fall_l = smoothstep((phi + 1.0) / 0.6)
        ang = np.where(upper, (meet - phi) * fall_u, (meet - phi) * 0.9 * fall_l) * near
        moved = _rot_x(V, c, -ang)                                                      # -ang: rotating about +X by a negative angle brings the upper lid down in this frame
        d2 = moved - c; n2 = np.linalg.norm(d2, axis=1, keepdims=True); th = np.arccos(np.clip(-d2[:, 1:2] / np.maximum(n2, 1e-6), -1, 1))
        dome = r * EYE['bulge'] * np.cos(np.pi / 2 * np.clip(th / (EYE['limbus'] * 1.15), 0, 1)) ** 2                    # the cornea stands proud of the eyeball
        lift = np.maximum(0, (r + dome + 0.07) - n2) * (near[:, None] > 0.02); moved = moved + d2 / np.maximum(n2, 1e-6) * lift   # never through the eyeball
        blink += (moved - V) * (near[:, None] > 0)
    out['Blink'] = blink[ids]
    # jaw: everything under the mouth line swings open about the jaw joint
    ec = (eye['l'] + eye['r']) / 2; pv = np.array([0.0, ec[1] + 8.0 * hs, ec[2] - 3.2 * hs])         # the hinge: behind the eyes, level with the ear hole
    up_i = bm.target('mouth-upperlip-volume-decr')[0]; lo_i = bm.target('mouth-lowerlip-volume-decr')[0]; only_up = np.setdiff1d(up_i, lo_i); only_lo = np.setdiff1d(lo_i, up_i)
    zm = (V[only_up][:, 2].min() + V[only_lo][:, 2].max()) / 2; x, y, z = V[:, 0], V[:, 1], V[:, 2]                      # the line where the lips meet
    W = bm.data()['W']; bi = {b: i for i, b in enumerate(bm.data()['bones'])}; wh = W[:, bi['Head']]
    low = smoothstep((zm - z) / 0.35); low[only_lo] = 1.0; low[only_up] = 0.0
    low = low * smoothstep((pv[1] + 1.0 - y) / 3.0) * smoothstep((7.0 * hs - np.abs(x)) / 3.0) * (wh > 0.5)
    lower_teeth = np.zeros(len(V)); lower_teeth[G['helper-lower-teeth']] = 1; lower_teeth[G['helper-tongue']] = 1
    wj = np.maximum(low * body, lower_teeth); out['JawOpen'] = ((_rot_x(V, pv, np.full(len(V), 0.26)) - V) * wj[:, None])[ids]
    for name, t in (('BrowUp', 'eyebrows-trans-up'), ('BrowDown', 'eyebrows-trans-down')):
        idx, dv = bm.target(t); o = np.zeros_like(V); o[idx] = dv * hs * 1.3; out[name] = o[ids]
    return out


def build(muscle=1.0, weight=0.58):
    """-> dict: V, F, UV (per face corner), W, bones, parent, J (joint heads), tails, masks, landmarks, part ids."""
    d = bm.data(); T = bm.macro(muscle, weight); T.update(FACE)
    V = bm.morph(T); V, J = bm.repose(V, bm.joints(V))
    W = d['W']; bi = {b: i for i, b in enumerate(d['bones'])}; wh = W[:, bi['Head']] + W[:, bi['Neck']] * 0.5
    V, L = _sculpt_head(V, wh)
    V, J = _reproportion(V, J)
    # trapezius: no visible neck, the shoulders run up into the back of the skull
    xs, ys, zs = V[:, 0], V[:, 1], V[:, 2]; sh = J['LeftArm']; nk = J['Neck']
    trap = gauss(zs - (sh[2] + 0.55 * (nk[2] - sh[2]) + 3.0), 7.5) * smoothstep((sh[0] * 0.95 - np.abs(xs)) / (sh[0] * 0.7)) * smoothstep((ys - (nk[1] - 5.0)) / 7.0) * (W[:, bi['Head']] < 0.6)
    trap[NBODY:] = 0; V[:, 2] += 4.2 * trap; V[:, 1] += 2.2 * trap
    belly = gauss(zs - (J['Spine'][2] + 2.0), 11.0) * smoothstep((-ys + 2.0) / 9.0) * smoothstep((16.0 - np.abs(xs)) / 9.0) * (W[:, bi['Spine']] + W[:, bi['Spine1']] + W[:, bi['Hips']] > 0.5); belly[NBODY:] = 0; V[:, 1] -= 3.2 * belly
    ground = V[:NBODY, 2].min(); V[:, 2] -= ground
    for k in J: J[k] = J[k] - np.array([0, 0, ground])
    # faces: body + teeth + tongue (the eyeballs are built separately, see seven.eyes)
    F = d['F']; fs = d['body_f'] + d['teeth_f'] + d['tongue_f']; part = np.array([0] * len(d['body_f']) + [1] * len(d['teeth_f']) + [2] * len(d['tongue_f']))
    ids = np.unique(np.concatenate([F[i] for i in fs])); remap = {v: k for k, v in enumerate(ids)}
    faces = [[remap[v] for v in F[i]] for i in fs]; uvs = [[tuple(d['UV'][j]) for j in d['FUV'][i]] for i in fs]
    P = V[ids]; Wk = W[ids]; N = bm.normals(V, [F[i] for i in d['body_f']])[ids]; body = ids < NBODY
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x)
    wsum = lambda keys: sum(Wk[:, bi[k]] for k in bi if any(k.startswith(p) or k.startswith('Left' + p) or k.startswith('Right' + p) for p in keys))
    w_head = Wk[:, bi['Head']]; w_arm = wsum(('Arm',)); w_fore = wsum(('ForeArm',)); w_hand = wsum(('Hand',)); w_leg = wsum(('UpLeg', 'Leg')); w_foot = wsum(('Foot', 'ToeBase'))
    # landmarks after reshaping
    G = d['groups']; eye = {s: V[G[f'helper-{s}-eye']].mean(0) for s in 'lr'}; eye_r = float(np.mean([np.linalg.norm(V[G[f'helper-{s}-eye']] - eye[s], axis=1).mean() for s in 'lr'])); eye_z = (eye['l'][2] + eye['r'][2]) / 2; eye_y = min(eye['l'][1], eye['r'][1])
    lip_i = bm.target('mouth-upperlip-volume-decr')[0]; lips = V[lip_i]; chin_z = V[bm.target('chin-prominent-incr')[0]][:, 2].min(); top = V[:NBODY, 2].max()      # V is already on the ground here
    hs = eye_r / 1.58; mouth_z = float(np.median(lips[:, 2]))
    ear = np.maximum(region('l-ear-trans-up', len(V)), region('r-ear-trans-up', len(V)))[ids]; is_ear = smoothstep((ear - 0.62) / 0.33)                # the flap itself; the skin round it grows hair
    w_torso = Wk[:, bi['Spine']] + Wk[:, bi['Spine1']] + Wk[:, bi['Spine2']] + Wk[:, bi['Hips']]; w_neck = Wk[:, bi['Neck']]
    # --- bare skin: the face from the brow ridge to the chin (the cheeks and temples are hairy), ears, palms, soles
    fy = smoothstep((eye_y + 4.6 * hs - y) / (2.6 * hs))
    wide = (4.9 + 0.5 * smoothstep((eye_z - 1.8 * hs - z) / (2.6 * hs))) * hs
    face = fy * smoothstep((z - (chin_z - 0.2)) / 1.6) * smoothstep(((eye_z + 4.3 * hs) - z) / (2.7 * hs)) * smoothstep((wide + 0.7 * hs - ax) / (2.4 * hs)) * (w_head > 0.5)      # hair thins out gradually onto the brow and cheeks: no hard hairline
    palm = smoothstep((w_hand - 0.5) / 0.3) * smoothstep((-N[:, 2] - 0.15) / 0.45)                 # T-pose: palms face down
    sole = smoothstep((w_foot - 0.5) / 0.3) * smoothstep((2.4 - z) / 1.4)
    bare = np.clip(np.maximum.reduce([face, is_ear, palm, sole]), 0, 1) * body
    # --- how thick the coat is (0..1): thin on the chest and belly, inside the arms and thighs, on the backs of hands and feet;
    #     a thinning patch above the brow; a sparse short beard on the chin
    front_t = smoothstep((-N[:, 1] - 0.15) / 0.5) * smoothstep((w_torso - 0.5) / 0.3)
    inner = smoothstep((-N[:, 2] - 0.2) / 0.5) * smoothstep((w_arm + w_fore - 0.5) / 0.3) + smoothstep((0.75 - np.abs(N[:, 0] * np.sign(x) - (-1))) / 0.6) * smoothstep((w_leg - 0.5) / 0.3) * (z > 22)
    thin = 1 - 0.50 * front_t - 0.40 * np.clip(inner, 0, 1) - 0.45 * smoothstep((w_hand - 0.5) / 0.4) - 0.45 * smoothstep((w_foot - 0.5) / 0.4)
    brow_patch = gauss(z - (eye_z + 4.6 * hs), 1.6 * hs) * smoothstep((3.4 * hs - ax) / (2.0 * hs)) * fy * (w_head > 0.5); thin = thin - 0.55 * brow_patch
    beard = smoothstep((mouth_z - 0.75 * hs - z) / (0.7 * hs)) * smoothstep((z - (chin_z - 1.2)) / 1.5) * smoothstep((3.9 * hs - ax) / (1.2 * hs)) * fy * (w_head > 0.5)
    fur = np.clip(np.maximum((1 - bare) * np.clip(thin, 0.12, 1), 0.16 * beard * (1 - is_ear)), 0, 1) * body
    # --- how long (cm)
    back_h = smoothstep((y - (eye_y + 9.0 * hs)) / (6.0 * hs)); side_h = smoothstep((ax - 3.6 * hs) / (2.6 * hs))
    length = np.full(len(P), 5.0)
    length = np.where(w_head > 0.5, 2.1 + 2.7 * side_h * (1 - 0.35 * back_h) + 1.5 * back_h, length)      # short on the crown, long on the cheeks, medium on the nape
    shoulder = gauss(z - J['LeftArm'][2], 12.0) * smoothstep((ax - 3) / 10) * (w_head < 0.3)
    length += 3.4 * smoothstep((w_arm - 0.3) / 0.5) + 1.6 * smoothstep((w_fore - 0.3) / 0.5) + 3.2 * shoulder * (1 - front_t) + 1.2 * smoothstep((w_leg - 0.4) / 0.4) * (z > 40) + 2.2 * w_neck
    length = length * (1 - 0.28 * front_t)
    length = np.where(w_hand > 0.5, 1.7, length); length = np.where(w_foot > 0.5, 1.6, length); length = np.minimum(length, 9.0)
    length = np.where(beard > 0.5, np.minimum(length, 1.1), length)
    grey = np.clip(beard * 1.2, 0, 1) * (w_head > 0.5)                                       # the chin goes white first
    # --- which way the hair lies (unit vectors in the T-pose): down the body, along the arms toward the elbow, back over the skull
    flow = np.tile(np.array([0.0, 0.25, -1.0]), (len(P), 1))
    flow[:, 0] = -np.sign(x) * 0.22 * front_t                                              # the chest hair leans toward the breastbone
    sgn = np.sign(x)[:, None]; elbow = J['LeftForeArm'][0]
    arm_dir = np.concatenate([sgn, np.zeros((len(P), 2))], 1) * np.where(ax[:, None] < elbow, 1.0, -1.0) + np.array([0, 0.2, -0.2])
    a = smoothstep((w_arm + w_fore - 0.35) / 0.4)[:, None]; flow = flow * (1 - a) + arm_dir * a
    hand_dir = np.concatenate([sgn, np.zeros((len(P), 2))], 1); h = smoothstep((w_hand - 0.4) / 0.4)[:, None]; flow = flow * (1 - h) + hand_dir * h
    head_dir = np.stack([np.sign(x) * 0.30 * side_h, np.full(len(P), 0.9), -0.20 - 0.75 * side_h - 0.5 * smoothstep((eye_z + 2 - z) / 6)], 1); hd = smoothstep((w_head - 0.4) / 0.4)[:, None]; flow = flow * (1 - hd) + head_dir * hd
    bd = np.clip(beard, 0, 1)[:, None]; flow = flow * (1 - bd) + np.array([0.0, -0.35, -1.0]) * bd
    foot_dir = np.tile(np.array([0.0, -1.0, -0.1]), (len(P), 1)); ft = smoothstep((w_foot - 0.4) / 0.4)[:, None]; flow = flow * (1 - ft) + foot_dir * ft
    flow /= np.linalg.norm(flow, axis=1, keepdims=True)
    # how far the hair stands off the skin, and how much it hangs (hanging only where "down" stays down when he moves: head, trunk, legs)
    lift = 0.30 + 0.16 * side_h * (w_head > 0.5) + 0.12 * shoulder + 0.06 * smoothstep((w_arm + w_fore - 0.4) / 0.4)
    hang = np.clip((w_head > 0.5) * 1.0 + w_torso + w_neck + smoothstep((w_leg - 0.4) / 0.4), 0, 1)
    # --- the device in his left forearm (device.py): the skin dips under it, scars around it, and grows no hair there
    dc = device.coords(dict(V=P, N=N, W=Wk, bones=list(d['bones']), ids=ids, J=J)); P[:, 2] -= 0.75 * dc['inside']
    fur = fur * (1 - dc['bare']) * (1 - 0.5 * smoothstep((3.5 - dc['d']) / 2.5) * dc['on']); length = length * (1 - 0.6 * smoothstep((4.0 - dc['d']) / 3.0) * dc['on'])
    away = np.stack([np.sign(dc['u']) * np.maximum(np.abs(dc['u']) - device.A * 0.6, 0), np.sign(dc['v']) * np.maximum(np.abs(dc['v']) - device.B * 0.6, 0) * 0.0 + (P[:, 1] - J['LeftForeArm'][1]) * 0.6, np.zeros(len(P))], 1)      # round the device the hair is brushed away from it
    an = np.linalg.norm(away, axis=1, keepdims=True); wdev = (smoothstep((5.0 - dc['d']) / 3.5) * dc['on'])[:, None]; flow = flow * (1 - wdev) + away / np.maximum(an, 1e-6) * wdev; flow /= np.linalg.norm(flow, axis=1, keepdims=True) + 1e-9
    tails = {}
    for n in d['bones']:
        kids = [k for k in d['bones'] if d['parent'][k] == n]
        chain = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head'}.get(n) or next((k for k in kids if k.endswith(('ForeArm', 'Hand', 'Leg', 'Foot', 'ToeBase', '2', '3', 'Arm')) and not k.endswith('Thumb2') or len(kids) == 1), None)
        if n.endswith('Hand'): chain = n + 'Middle1'
        if n.endswith('HandThumb1'): chain = n[:-1] + '2'
        if chain and chain in J: tails[n] = J[chain]
        else:
            p = d['parent'][n]; v = J[n] - J[p] if p else np.array([0, 0, 1.0]); L_ = np.linalg.norm(v) or 1.0
            tails[n] = J[n] + (np.array([0, 0, 12.0]) if n == 'Head' else np.array([0, -8.0, 0]) if n.endswith('ToeBase') else v / L_ * max(2.0, L_ * 0.7))
    shapes = _face_shapes(V, ids, eye, J, G)
    bones = list(d['bones']); parent = dict(d['parent']); Wk = np.concatenate([Wk, np.zeros((len(P), 2), np.float32)], 1)
    for s_, name in (('l', 'LeftEye'), ('r', 'RightEye')):
        bones.append(name); parent[name] = 'Head'; J[name] = eye[s_].copy(); tails[name] = eye[s_] + np.array([0, -2.5, 0])
    return dict(V=P, F=faces, UV=uvs, W=Wk, bones=bones, parent=parent, J=J, tails=tails, part=part, N=N, ids=ids, shapes=shapes,
                masks=dict(bare=bare, fur=fur, length=length, device=dc['inside'], dev_ring=dc['ring'], dev_on=dc['on'], face=face * body, ear=is_ear * body, grey=grey, lift=lift, hang=hang, palm=palm * body, sole=sole * body, nostril=L['nostril'][ids], muzzle=L['muzzle'][ids]),
                flow=flow, dev_uv=np.stack([dc['u'], dc['v']], 1), stature=float(top),
                marks=dict(eye=eye, eye_r=eye_r, eye_z=eye_z, lips=np.array([0, lips[:, 1].min(), np.median(lips[:, 2])]), chin_z=chin_z, top=top))


if __name__ == '__main__':
    b = build(); print('verts', len(b['V']), 'faces', len(b['F']), 'stature', round(b['stature'], 1), 'arm span', round(np.abs(b['V'][:, 0]).max() * 2, 1))
    print({k: round(float(v.sum()), 1) for k, v in b['masks'].items()}); print({k: np.round(v, 1) for k, v in b['J'].items() if k in ('Hips', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftLeg', 'LeftFoot')})
