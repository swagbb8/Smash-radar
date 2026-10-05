"""Seven's body: a chimpanzee sculpted out of the CC0 MakeHuman base mesh, in numpy.

    human base  ->  heavy muscular build  ->  ape face (MakeHuman's own face sliders pushed past human limits, then a
    sculpted muzzle, brow ridge, low sloping skull and big ears)  ->  ape proportions (long arms, short legs, barrel
    chest, no neck)  ->  maps for the fur, the bare skin and the device in his left forearm.

Rest space: centimetres, +X = his left, -Y = forward, +Z = up, T-pose, feet on z = 0.
"""
import numpy as np
import basemesh as bm
from basemesh import smoothstep, gauss, NBODY

# MakeHuman face sliders, pushed toward an ape (values above 1 leave the human range on purpose)
FACE = {
    'forehead-trans-backward': 1.3, 'forehead-scale-vert-decr': 1.0, 'forehead-temple-decr': 0.6, 'eyebrows-trans-forward': 1.6, 'eyebrows-trans-down': 1.0, 'eyebrows-angle-down': 0.3,
    'nose-scale-depth-decr': 1.3, 'nose-trans-backward': 0.5, 'nose-flaring-incr': 1.2, 'nose-nostrils-width-incr': 1.2, 'nose-width1-incr': 0.8, 'nose-width2-incr': 1.0, 'nose-width3-incr': 1.0,
    'nose-scale-vert-decr': 0.9, 'nose-point-up': 0.6, 'nose-hump-decr': 1.0, 'nose-greek-incr': 0.6, 'nose-nostrils-angle-up': 0.6, 'nose-volume-decr': 0.5,
    'mouth-scale-horiz-incr': 1.6, 'mouth-trans-forward': 1.2, 'mouth-scale-depth-incr': 0.8, 'mouth-upperlip-volume-decr': 1.2, 'mouth-lowerlip-volume-decr': 0.9, 'mouth-upperlip-height-incr': 1.0,
    'mouth-trans-down': 0.9, 'mouth-cupidsbow-decr': 1.0, 'mouth-philtrum-volume-decr': 1.0, 'mouth-angles-down': 0.35,
    'chin-prominent-decr': 1.2, 'chin-height-decr': 0.8, 'chin-width-incr': 1.0, 'chin-bones-incr': 0.8, 'chin-prognathism-incr': 0.9, 'chin-cleft-decr': 1.0,
    'head-scale-depth-incr': 0.5, 'head-fat-incr': 0.25, 'head-square': 0.5,
    'measure-neck-circ-incr': 1.6, 'neck-scale-depth-incr': 1.0, 'neck-scale-horiz-incr': 1.0, 'neck-back-scale-depth-incr': 1.0,
}
for side in 'lr':
    FACE.update({f'{side}-ear-scale-incr': 1.0, f'{side}-ear-wing-incr': 1.0, f'{side}-ear-scale-vert-incr': 0.4, f'{side}-ear-shape-round': 0.7, f'{side}-ear-flap-incr': 0.6, f'{side}-ear-lobe-decr': 1.0,
                 f'{side}-eye-scale-decr': 0.5, f'{side}-eye-trans-in': 0.7, f'{side}-eye-push1-in': 0.6, f'{side}-eye-push2-in': 0.6, f'{side}-eye-bag-incr': 0.7, f'{side}-eye-eyefold-down': 0.5,
                 f'{side}-cheek-bones-incr': 0.8, f'{side}-cheek-volume-decr': 0.6, f'{side}-cheek-inner-decr': 0.4})

# ape proportions as per-bone scale along world X, Y, Z in the T-pose (arms run along X, legs and spine along Z, feet along Y)
PROP = {
    'Hips': (1.16, 1.22, 1.00), 'Spine': (1.22, 1.38, 1.00), 'Spine1': (1.26, 1.42, 1.03), 'Spine2': (1.30, 1.40, 1.06),
    'Neck': (1.30, 1.34, 0.42), 'Head': (1.12, 1.12, 1.12),
    'Shoulder': (1.14, 1.34, 1.34), 'Arm': (1.20, 1.52, 1.52), 'ForeArm': (1.26, 1.44, 1.44), 'Hand': (1.18, 1.26, 1.30),
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


def _sculpt_head(V, wh):
    """Muzzle, brow ridge, low sloping skull, big ears. Applied to head vertices only (wh = head weight), eyeballs kept round."""
    d = bm.data(); G = d['groups']; L = _landmarks(V); out = V.copy(); x, y, z = V[:, 0], V[:, 1], V[:, 2]; ax = np.abs(x)
    front = smoothstep((L['eye_y'] + 7.5 - y) / 6.0)                                   # 1 on the face, 0 behind the ears
    zb = L['eye_z'] + 2.3                                                               # brow line
    # 1. skull: lower it and slope it straight back from the brow
    up = np.maximum(0, z - zb); t = smoothstep(up / (L['top'] - zb)); dz = -up * 0.13 * (0.4 + 0.6 * front); dy = 0.30 * up * front * (1 - 0.35 * t)
    # 2. brow ridge: one heavy bar across both eyes
    brow = gauss(z - (zb - 0.5), 1.15) * smoothstep((7.4 - ax) / 2.4) * front; dy -= 1.35 * brow; dz += 0.2 * brow
    # 3. muzzle: the whole lower face comes forward as one rounded snout, widest at the mouth
    zm = L['lips_z'] + 1.0; span = (L['eye_z'] - 1.6) - L['chin_z']
    vert = smoothstep((L['eye_z'] - 1.2 - z) / 3.2) * smoothstep((z - (L['chin_z'] - 1.5)) / 3.0)      # from under the eyes to the chin
    side = np.cos(np.pi / 2 * np.clip(ax / 6.3, 0, 1)) ** 0.75                              # rounded like a snout, not a box
    m = vert * side * front; bulge = 0.75 + 0.25 * gauss(z - zm, span * 0.32)
    dy -= 4.6 * m * bulge; dxm = x * 0.16 * m                                           # forward and a little wider
    # 4. no chin: under the lips the jaw falls back and tucks up
    under = smoothstep((L['lips_z'] - 1.6 - z) / 2.6) * smoothstep((4.5 - ax) / 2.0) * front; dy += 1.5 * under; dz += 0.5 * under * smoothstep((L['chin_z'] + 2.5 - z) / 2.5)
    # 5. upper lip long and flat, nose pressed onto the muzzle
    nose = gauss(z - (L['nose_tip'][2] + 0.2), 1.3) * smoothstep((2.4 - ax) / 1.2) * smoothstep((L['nose_tip'][1] + 2.6 - y) / 2.2); dy += 1.25 * nose
    # 6. heavier jaw line
    jaw = gauss(z - (L['chin_z'] + 3.2), 2.6) * smoothstep((ax - 3.0) / 2.5) * smoothstep((L['eye_y'] + 9.5 - y) / 5.0); dxj = np.sign(x) * 0.75 * jaw
    k = smoothstep((wh - 0.45) / 0.4)                                                    # fade out down the neck
    out[:, 0] += (dxm + dxj - x * 0.07 * t) * k; out[:, 1] += dy * k; out[:, 2] += dz * k
    # 7. ears: bigger and standing out from the skull
    for s in 'lr':
        idx = L['ear'][s]; c = V[idx].mean(0); p = out[idx] - (c + (out[idx] - V[idx]).mean(0)); w = smoothstep((np.abs(V[idx, 0]) - (np.abs(c[0]) - 1.6)) / 1.4)[:, None]
        sgn = 1 if s == 'l' else -1; out[idx] += p * 0.34 * w + np.array([sgn * 0.75, 0.25, 0.5]) * w
    # eyeballs stay rigid: move each with the skin around it, do not stretch it
    for s in 'lr':
        gi = G[f'helper-{s}-eye']; lids = np.concatenate([G[f'joint-{s}-upperlid'], G[f'joint-{s}-lowerlid']]); out[gi] = V[gi] + (out[lids] - V[lids]).mean(0) * np.array([1, 0.55, 1])
    # nostrils: two dark slots high on the muzzle, facing forward
    nose_i = bm.target('nose-volume-incr')[0]; nc = out[nose_i]; tip = nc[np.argmin(nc[:, 1])]; nostril = np.zeros(len(V))
    for sgn in (1, -1):
        c = tip + np.array([sgn * 1.0, 0.45, -0.15]); r = np.sqrt(((out - c) * np.array([1.0, 0.8, 1.5])) ** 2).sum(1) if False else np.linalg.norm((out - c) * np.array([1.0, 0.8, 1.5]), axis=1)
        g_ = gauss(r, 0.40) * (wh > 0.6); out[:, 1] += 0.7 * g_; nostril = np.maximum(nostril, g_)
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
    # faces: body + eyes + teeth + tongue
    F = d['F']; fs = d['body_f'] + d['eye_f'] + d['teeth_f'] + d['tongue_f']; part = np.array([0] * len(d['body_f']) + [1] * len(d['eye_f']) + [2] * len(d['teeth_f']) + [3] * len(d['tongue_f']))
    ids = np.unique(np.concatenate([F[i] for i in fs])); remap = {v: k for k, v in enumerate(ids)}
    faces = [[remap[v] for v in F[i]] for i in fs]; uvs = [[tuple(d['UV'][j]) for j in d['FUV'][i]] for i in fs]
    P = V[ids]; Wk = W[ids]; N = bm.normals(V, [F[i] for i in d['body_f']])[ids]; body = ids < NBODY
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x)
    wsum = lambda keys: sum(Wk[:, bi[k]] for k in bi if any(k.startswith(p) or k.startswith('Left' + p) or k.startswith('Right' + p) for p in keys))
    w_head = Wk[:, bi['Head']]; w_arm = wsum(('Arm',)); w_fore = wsum(('ForeArm',)); w_hand = wsum(('Hand',)); w_leg = wsum(('UpLeg', 'Leg')); w_foot = wsum(('Foot', 'ToeBase'))
    # landmarks after reshaping
    G = d['groups']; eye = {s: V[G[f'helper-{s}-eye']].mean(0) for s in 'lr'}; eye_z = (eye['l'][2] + eye['r'][2]) / 2; eye_y = min(eye['l'][1], eye['r'][1])
    lip_i = bm.target('mouth-upperlip-volume-decr')[0]; lips = V[lip_i]; chin_z = V[bm.target('chin-prominent-incr')[0]][:, 2].min(); top = V[:NBODY, 2].max()      # V is already on the ground here
    ear_ids = np.concatenate([bm.target(f'{s}-ear-scale-incr')[0] for s in 'lr']); is_ear = np.isin(ids, ear_ids) & (ax > np.abs(eye['l'][0]) + 3.2)
    # --- bare skin: face (brow to chin, between the ears), ears, palms, soles
    fy = smoothstep((eye_y + 5.2 - y) / 3.0)
    wide = 5.6 + 0.9 * smoothstep((eye_z - 2.0 - z) / 3.0)                                 # hair grows in on the temples and cheeks, the muzzle stays bare
    face = fy * smoothstep((z - (chin_z - 0.3)) / 1.5) * smoothstep(((eye_z + 3.2) - z) / 1.4) * smoothstep((wide - ax) / 1.6) * (w_head > 0.5)
    palm = smoothstep((w_hand - 0.5) / 0.3) * smoothstep((-N[:, 2] - 0.15) / 0.45)                 # T-pose: palms face down
    sole = smoothstep((w_foot - 0.5) / 0.3) * smoothstep((2.4 - z) / 1.4)
    bare = np.clip(np.maximum.reduce([face, is_ear.astype(float), palm, sole]), 0, 1) * body
    # --- fur: everywhere else; thinner on the backs of the hands and feet, the chest and the scalp line
    rng = np.random.default_rng(7); thin = 1 - 0.45 * smoothstep((w_hand - 0.5) / 0.4) - 0.45 * smoothstep((w_foot - 0.5) / 0.4)
    fur = np.clip((1 - bare) * thin, 0, 1) * body
    length = np.full(len(P), 4.6)                                                          # cm
    length = np.where(w_head > 0.5, 2.0 + 2.6 * smoothstep((ax - 4.0) / 3.5) + 1.2 * smoothstep((y - eye_y - 9) / 6.0), length)      # short on the crown, longer on the cheeks and nape
    length += 3.6 * smoothstep((w_arm - 0.3) / 0.5) + 2.4 * smoothstep((w_fore - 0.3) / 0.5)    # shaggy arms
    shoulder = gauss(z - J['LeftArm'][2], 11.0) * smoothstep((ax - 4) / 10) * (w_head < 0.3); length += 3.4 * shoulder
    length = np.where(w_hand > 0.5, 1.6, length); length = np.where(w_foot > 0.5, 1.5, length); length += 0.6 * smoothstep((w_leg - 0.4) / 0.4)
    # --- which way the hair lies (unit vectors in the T-pose): down the body, along the arms toward the elbow, back over the skull
    flow = np.tile(np.array([0.0, 0.25, -1.0]), (len(P), 1))
    sgn = np.sign(x)[:, None]; elbow = J['LeftForeArm'][0]
    arm_dir = np.concatenate([sgn, np.zeros((len(P), 2))], 1) * np.where(ax[:, None] < elbow, 1.0, -1.0) + np.array([0, 0.2, -0.35])
    a = smoothstep((w_arm + w_fore - 0.35) / 0.4)[:, None]; flow = flow * (1 - a) + arm_dir * a
    hand_dir = np.concatenate([sgn, np.zeros((len(P), 2))], 1); h = smoothstep((w_hand - 0.4) / 0.4)[:, None]; flow = flow * (1 - h) + hand_dir * h
    head_dir = np.stack([np.sign(x) * 0.35 * smoothstep((ax - 2) / 4), np.full(len(P), 0.9), -0.25 - 0.6 * smoothstep((eye_z + 2 - z) / 6)], 1); hd = smoothstep((w_head - 0.4) / 0.4)[:, None]; flow = flow * (1 - hd) + head_dir * hd
    foot_dir = np.tile(np.array([0.0, -1.0, -0.1]), (len(P), 1)); ft = smoothstep((w_foot - 0.4) / 0.4)[:, None]; flow = flow * (1 - ft) + foot_dir * ft
    flow /= np.linalg.norm(flow, axis=1, keepdims=True)
    # --- the device: a plate under the skin on top of his left forearm
    ex, wx = J['LeftForeArm'][0], J['LeftHand'][0]; u = (x - ex) / (wx - ex); c = np.array([ex + 0.56 * (wx - ex), J['LeftForeArm'][1], J['LeftForeArm'][2]])
    dev_u = (u - 0.56) / 0.21; dev_v = (y - c[1]) / 3.4; on_top = smoothstep((N[:, 2] - 0.25) / 0.4) * (x > 0) * smoothstep((w_fore - 0.4) / 0.3)
    device = np.clip(1 - np.maximum(np.abs(dev_u), np.abs(dev_v)) ** 4, 0, 1) * on_top * body
    fur = fur * (1 - 0.78 * smoothstep(device / 0.3)); length = length * (1 - 0.5 * smoothstep(device / 0.3))          # the hair is thin and short over the plate, so it shows
    # iris direction for the eye shader (1 = looking straight out of the eyeball's front)
    iris = np.zeros(len(P))
    for s in 'lr':
        gi = G[f'helper-{s}-eye']; cc = V[gi].mean(0); dv = V[gi] - cc; dv /= np.linalg.norm(dv, axis=1, keepdims=True)
        for v, val in zip(gi, -dv[:, 1]): iris[remap[v]] = val
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
    return dict(V=P, F=faces, UV=uvs, W=Wk, bones=d['bones'], parent=d['parent'], J=J, tails=tails, part=part, N=N, ids=ids,
                masks=dict(bare=bare, fur=fur, length=length, device=device, iris=iris, face=face * body, ear=is_ear.astype(float), palm=palm * body, sole=sole * body, nostril=L['nostril'][ids], muzzle=L['muzzle'][ids]),
                flow=flow, dev_uv=np.stack([dev_u, dev_v], 1), stature=float(top),
                marks=dict(eye=eye, eye_z=eye_z, lips=np.array([0, lips[:, 1].min(), np.median(lips[:, 2])]), chin_z=chin_z, top=top, device=c))


if __name__ == '__main__':
    b = build(); print('verts', len(b['V']), 'faces', len(b['F']), 'stature', round(b['stature'], 1), 'arm span', round(np.abs(b['V'][:, 0]).max() * 2, 1))
    print({k: round(float(v.sum()), 1) for k, v in b['masks'].items()}); print({k: np.round(v, 1) for k, v in b['J'].items() if k in ('Hips', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftLeg', 'LeftFoot')})
