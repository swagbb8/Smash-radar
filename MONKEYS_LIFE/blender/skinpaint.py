"""Painted skin for Seven's head, drawn in code: a height map (nostrils, folds, wrinkles, skin grain), a colour map and a
roughness map.

The head gets its own UV map, a cylinder unwrapped around the skull: u = angle around the vertical axis (0.5 = straight
ahead, the map stops behind the ears because the rest is under hair), v = height. Features are placed in "face
coordinates" (x = his left, z = up, centimetres, as seen from straight ahead) and laid onto the real surface, so the
painting follows whatever the sculpt in ape.py does.

    paint(b, size)  ->  {'height': path, 'colour': path, 'rough': path}      (cached by a hash of the mesh + this file)
"""
import hashlib, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
from scipy.spatial import cKDTree
import basemesh as bm
from basemesh import smoothstep, gauss, NBODY

THMAX = np.radians(118.0)        # half-width of the unwrap, measured around the head from straight ahead
HRANGE = 1.6                     # centimetres of height the 16-bit map spans; 0.5 = untouched skin
CACHE = os.path.join(bm.ROOT, 'assets', 'seven')


def head_uv(b):
    """-> (uv (n, 2), where the painted maps apply (n,), frame)"""
    P = b['V']; mk = b['marks']; yc = mk['eye']['l'][1] + 11.0; z0 = mk['chin_z'] - 4.5; z1 = mk['top'] + 0.8
    th = np.arctan2(P[:, 0], -(P[:, 1] - yc)); u = 0.5 + th / (2 * THMAX); v = (P[:, 2] - z0) / (z1 - z0)
    wh = b['W'][:, b['bones'].index('Head')]
    mask = smoothstep((wh - 0.55) / 0.35) * smoothstep((THMAX - np.abs(th)) / np.radians(16)) * (b['ids'] < NBODY)
    return np.stack([u, v], 1).astype(np.float32), mask.astype(np.float32), dict(yc=yc, z0=z0, z1=z1)


# ------------------------------------------------------------------------------------------------ the canvas
class Canvas:
    """Everything needed to draw on the unwrapped head: where each texel is in space, and where a face coordinate lands."""

    def __init__(self, b, size):
        self.b = b; self.S = S = size; self.uv, self.mask, self.fr = head_uv(b); P = b['V']; self.mk = b['marks']
        self.pos = self._bake(P); self.x, self.y, self.z = self.pos[..., 0], self.pos[..., 1], self.pos[..., 2]
        # the front of the face as a height field y(x, z), for laying face-coordinate strokes onto the surface
        wh = b['W'][:, b['bones'].index('Head')]; fr = np.nonzero((b['ids'] < NBODY) & (wh > 0.5) & (b['N'][:, 1] < -0.12) & (P[:, 1] < self.fr['yc'] - 2.0))[0]
        t2 = cKDTree(P[fr][:, [0, 2]]); nb = t2.query_ball_point(P[fr][:, [0, 2]], 0.6); fr = fr[[P[i, 1] <= min(P[fr[j], 1] for j in nb[k]) + 0.9 for k, i in enumerate(fr)]]      # outer skin only: nothing hidden inside the mouth or behind the lids
        self._lin = LinearNDInterpolator(P[fr][:, [0, 2]], P[fr][:, 1]); self._near = NearestNDInterpolator(P[fr][:, [0, 2]], P[fr][:, 1])
        self.py_cm = S / (self.fr['z1'] - self.fr['z0'])                                   # texels per centimetre, vertically
        r = np.sqrt(self.x ** 2 + (self.y - self.fr['yc']) ** 2); self.px_cm = S / (2 * THMAX * np.maximum(r, 4.0))      # ... and sideways (varies with how far the skin is from the axis)
        self.front = smoothstep((self.fr['yc'] - 3.0 - self.y) / 4.0)                      # 1 on the face, 0 by the ears

    def _bake(self, P):
        """3D position of every texel (rasterise the head's triangles in UV space, then fill the gaps from the nearest texel)."""
        S = self.S; pos = np.zeros((S, S, 3), np.float32); hit = np.zeros((S, S), bool); rad = np.zeros((S, S), np.float32); uv = self.uv; px = np.stack([uv[:, 0] * S, (1 - uv[:, 1]) * S], 1); yc = self.fr['yc']
        for fi, f in enumerate(self.b['F']):
            if self.b['part'][fi] != 0 or self.mask[f].max() <= 0: continue
            for a in range(1, len(f) - 1):
                t = (f[0], f[a], f[a + 1]); q = px[list(t)]
                if np.ptp(q[:, 0]) > S * 0.5: continue
                T3 = P[list(t)]; nrm = np.cross(T3[1] - T3[0], T3[2] - T3[0]); cen = T3.mean(0); out_dir = np.array([cen[0], cen[1] - yc, 0.0])
                if nrm @ out_dir <= 0: continue                                             # faces looking inward: the mouth, the nostrils, the ear canal
                x0, x1 = int(max(0, np.floor(q[:, 0].min()))), int(min(S - 1, np.ceil(q[:, 0].max()))); y0, y1 = int(max(0, np.floor(q[:, 1].min()))), int(min(S - 1, np.ceil(q[:, 1].max())))
                if x1 < x0 or y1 < y0: continue
                gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5); d = (q[1, 1] - q[2, 1]) * (q[0, 0] - q[2, 0]) + (q[2, 0] - q[1, 0]) * (q[0, 1] - q[2, 1])
                if abs(d) < 1e-9: continue
                w0 = ((q[1, 1] - q[2, 1]) * (gx - q[2, 0]) + (q[2, 0] - q[1, 0]) * (gy - q[2, 1])) / d; w1 = ((q[2, 1] - q[0, 1]) * (gx - q[2, 0]) + (q[0, 0] - q[2, 0]) * (gy - q[2, 1])) / d; w2 = 1 - w0 - w1
                ins = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
                if not ins.any(): continue
                val = (w0[..., None] * T3[0] + w1[..., None] * T3[1] + w2[..., None] * T3[2]).astype(np.float32); rr = np.sqrt(val[..., 0] ** 2 + (val[..., 1] - yc) ** 2)
                sub = pos[y0:y1 + 1, x0:x1 + 1]; rsub = rad[y0:y1 + 1, x0:x1 + 1]; ins &= rr > rsub; sub[ins] = val[ins]; rsub[ins] = rr[ins]; hit[y0:y1 + 1, x0:x1 + 1] |= ins   # where skin overlaps, the outermost wins
        idx = ndi.distance_transform_edt(~hit, return_distances=False, return_indices=True); self.hit = hit
        return pos[idx[0], idx[1]]

    def to_px(self, x, z):
        """Face coordinates -> texel coordinates (arrays)."""
        x = np.asarray(x, float); z = np.asarray(z, float); y = self._lin(x, z); bad = np.isnan(y)
        if bad.any(): y = np.where(bad, self._near(x, z), y)
        th = np.arctan2(x, -(y - self.fr['yc'])); return (0.5 + th / (2 * THMAX)) * self.S, (1 - (z - self.fr['z0']) / (self.fr['z1'] - self.fr['z0'])) * self.S

    def strokes(self, lines, width, depth, shoulder=0.3, taper=0.6):
        """Draw creases. lines: [(xs, zs, strength)] in face coordinates; width = half-width of the valley in cm; depth in cm.
        -> height (S, S): a V-shaped valley with a low ridge on each side, fading out toward both ends of every line."""
        S = self.S; on = Image.new('L', (S, S), 0); val = Image.new('L', (S, S), 0); d_on = ImageDraw.Draw(on); d_val = ImageDraw.Draw(val)
        for xs, zs, strength in lines:
            u, v = self.to_px(xs, zs); n = len(u)
            for i in range(n - 1):
                t = (i + 0.5) / (n - 1); k = min(1.0, (np.sin(np.pi * t) / max(1e-3, np.sin(np.pi * taper / 2))) if taper > 0 else 1.0) if t < taper / 2 or t > 1 - taper / 2 else 1.0
                seg = [(float(u[i]), float(v[i])), (float(u[i + 1]), float(v[i + 1]))]; d_on.line(seg, fill=255, width=1); d_val.line(seg, fill=int(np.clip(255 * strength * k, 1, 255)), width=3)
        on = np.asarray(on) > 0
        if not on.any(): return np.zeros((S, S), np.float32)
        sx = float(np.median(self.px_cm[on])); dist, idx = ndi.distance_transform_edt(~on, sampling=(1 / self.py_cm, 1 / sx), return_indices=True)
        k = np.asarray(val, np.float32)[idx[0], idx[1]] / 255.0; d = dist / width
        h = -np.exp(-d ** 2) + shoulder * np.exp(-((d - 1.9) / 0.9) ** 2)
        return (depth * k * h).astype(np.float32)

    def cells(self, size, seed, jitter=1.0):
        """Skin grain as it really is: a net of fine creases around little plateaus. Measured in 3D, so it does not stretch.
        -> (distance to the nearest crease in units of the cell size, a random number per plateau)"""
        rng = np.random.default_rng(seed); S = self.S; pts = self.pos.reshape(-1, 3)
        area = (1.0 / (self.px_cm * self.py_cm)).reshape(-1); n = int(area.sum() / (size * size) * 1.2); p = area / area.sum()
        seeds = pts[rng.choice(len(pts), size=n, p=p)] + rng.normal(0, size * 0.15 * jitter, (n, 3))
        d, i = cKDTree(seeds).query(pts, k=2, workers=-1); edge = (d[:, 1] - d[:, 0]) / size
        return edge.reshape(S, S).astype(np.float32), rng.random(n).astype(np.float32)[i[:, 0]].reshape(S, S)

    def noise(self, scale_cm, seed, octaves=3):
        """Smooth value noise in 3D (so it has no seams and does not stretch), 0..1."""
        rng = np.random.default_rng(seed); out = np.zeros((self.S, self.S), np.float32); amp = 1.0; tot = 0.0; pts = self.pos.reshape(-1, 3)
        for o in range(octaves):
            s = scale_cm / 2 ** o; g = rng.random((64, 64, 64)).astype(np.float32); q = (pts + 500.0) / s + rng.uniform(0, 64, 3)
            out += amp * ndi.map_coordinates(g, q.T, order=1, mode='grid-wrap').reshape(self.S, self.S); tot += amp; amp *= 0.5
        return out / tot


# ------------------------------------------------------------------------------------------------ the design
def _arc(x0, x1, z_end, sag, n=24, wob=0.0, rng=None):
    t = np.linspace(-1, 1, n); xs = (x0 + x1) / 2 + (x1 - x0) / 2 * t; zs = z_end + sag * (1 - t ** 2)
    if wob and rng is not None: zs = zs + ndi.gaussian_filter1d(rng.normal(0, wob, n), 2.0)
    return xs, zs


def design(C, seed=7):
    """All the creases of the face, by class. Coordinates are measured from the eyes so the layout survives re-sculpting."""
    mk = C.mk; rng = np.random.default_rng(seed); ez = mk['eye_z']; el, er = mk['eye']['l'][0], mk['eye']['r'][0]; hs = mk['eye_r'] / 1.58          # head scale against the base mesh
    mz = mk['lips'][2]; mw = mk['mouth_w']; nz = ez - 4.45 * hs                                                                                  # mouth line, mouth half-width, nostril height
    major, medium, fine = [], [], []
    for ex, sg in ((el, 1), (er, -1)):
        # bags under the eyes, creases over the lids, crow's feet
        for k in range(3): major.append((*_arc(ex - sg * (1.5 + 0.2 * k) * hs, ex + sg * (2.0 + 0.3 * k) * hs, ez - (0.95 + 0.42 * k) * hs, -(0.42 + 0.1 * k) * hs, wob=0.02, rng=rng), 1.0 - 0.22 * k))
        for k in range(2): medium.append((*_arc(ex - sg * (1.4 + 0.2 * k) * hs, ex + sg * (1.9 + 0.2 * k) * hs, ez + (0.62 + 0.36 * k) * hs, (0.32 + 0.05 * k) * hs, wob=0.015, rng=rng), 1.0 - 0.3 * k))
        cx = ex + sg * 1.95 * hs
        for a in (-38, -16, 8, 30):
            L = rng.uniform(0.9, 1.5) * hs; t = np.linspace(0, 1, 10); ang = np.radians(a); medium.append((cx + sg * (0.25 + L * t) * np.cos(ang) * hs, ez + 0.05 + (0.25 + L * t) * np.sin(ang) + 0.12 * t ** 2 * np.sign(a), 0.75))
        # the fold from beside the nose around the muzzle to the corner of the mouth
        t = np.linspace(0, 1, 30); fx = sg * (1.9 + 3.4 * t ** 0.8) * hs; fz = (nz + 1.5 * hs) * (1 - t) + (mz - 0.4 * hs) * t - 0.9 * hs * np.sin(np.pi * t) * 0.35; major.append((fx, fz, 0.9))
        # cheek lines running down and back from under the eye
        for k in range(3):
            t = np.linspace(0, 1, 14); medium.append((ex + sg * (1.6 + 0.5 * k + 1.3 * t) * hs, ez - (1.9 + 0.35 * k) * hs - (1.6 + 0.3 * k) * t * hs, 0.45))
    # furrows across the brow ridge and the forehead above it, a knot between the brows
    for k in range(4):
        zc = ez + (1.7 + 0.72 * k + rng.uniform(-0.1, 0.1)) * hs; cuts = np.sort(rng.uniform(-4.6, 4.6, 2)) * hs; edges = [-(5.5 - 0.4 * k) * hs, cuts[0] - 0.25, cuts[0] + 0.25, cuts[1] - 0.25, cuts[1] + 0.25, (5.5 - 0.4 * k) * hs]
        for a_, b_ in zip(edges[0::2], edges[1::2]):
            if b_ - a_ > 0.8: (major if k < 2 else medium).append((*_arc(a_, b_, zc + rng.uniform(-0.12, 0.12), rng.uniform(-0.1, 0.22) * hs, n=24, wob=0.06, rng=rng), 0.85 - 0.12 * k))
    for sx in (-0.45, 0.4, 0.0): medium.append((np.full(10, sx * hs) + rng.normal(0, 0.03, 10), np.linspace(ez + 0.5 * hs, ez + 1.7 * hs, 10), 0.7))
    # wrinkles across the bridge of the nose
    for k in range(4): medium.append((*_arc(-(1.3 - 0.1 * k) * hs, (1.3 - 0.1 * k) * hs, ez - (0.75 + 0.55 * k) * hs, -(0.16 + 0.03 * k) * hs, n=16, wob=0.015, rng=rng), 0.9 - 0.12 * k))
    # the long upper lip: fine lines fanning down from the nose to the mouth, a shallow groove in the middle
    for i in range(34):
        f = (i + rng.uniform(-0.3, 0.3)) / 33 * 2 - 1; xb = f * mw * 0.93; t = np.linspace(0, 1, 9); fine.append((xb * (0.72 + 0.28 * t) + rng.normal(0, 0.02, 9), (nz - 0.85 * hs) * (1 - t) + (mz + 0.22 * hs) * t, rng.uniform(0.5, 1.0)))
    medium.append((np.zeros(8), np.linspace(nz - 0.9 * hs, mz + 0.25 * hs, 8), 0.55))
    # under the mouth: lines running down off the lower lip, the crease above the chin
    for i in range(26):
        f = (i + rng.uniform(-0.3, 0.3)) / 25 * 2 - 1; xb = f * mw * 0.85; t = np.linspace(0, 1, 7); fine.append((xb * (1 - 0.18 * t) + rng.normal(0, 0.02, 7), (mz - 0.3 * hs) - 1.7 * hs * t, rng.uniform(0.4, 0.9)))
    medium.append((*_arc(-mw * 0.62, mw * 0.62, mz - 1.55 * hs, 0.3 * hs, n=20, wob=0.02, rng=rng), 0.7))
    # two old scars: one through the right brow, one on the left of the muzzle
    scars = [(np.linspace(er - 1.9 * hs, er - 0.5 * hs, 14) + rng.normal(0, 0.03, 14), np.linspace(ez + 3.3 * hs, ez + 0.9 * hs, 14), 1.0),
             (np.linspace(2.4 * hs, 3.6 * hs, 10) + rng.normal(0, 0.03, 10), np.linspace(nz - 0.6 * hs, nz - 2.2 * hs, 10), 0.8)]
    return dict(major=major, medium=medium, fine=fine, scars=scars, nz=nz, mz=mz, mw=mw, hs=hs)


def _mouth_width(b):
    up = bm.target('mouth-upperlip-volume-decr')[0]; inv = {v: k for k, v in enumerate(b['ids'])}; return float(np.abs(b['V'][[inv[v] for v in up if v in inv], 0]).max())


def paint(b, size=2048, force=False, verbose=False):
    """Paint (or load) the maps. -> {'height': png path, 'colour': png path, 'rough': png path, 'uv': ..., 'mask': ...}"""
    os.makedirs(CACHE, exist_ok=True); uv, mask, fr = head_uv(b)
    key = hashlib.sha1(np.round(b['V'], 2).tobytes() + open(__file__, 'rb').read() + str(size).encode()).hexdigest()[:10]
    paths = {k: os.path.join(CACHE, f'head_{k}_{size}.png') for k in ('height', 'colour', 'rough')}; stamp = os.path.join(CACHE, f'head_{size}.key')
    if not force and all(os.path.exists(p) for p in paths.values()) and os.path.exists(stamp) and open(stamp).read().strip() == key: return dict(paths, uv=uv, mask=mask)
    b['marks']['mouth_w'] = _mouth_width(b); C = Canvas(b, size); D = design(C); S = size; mk = C.mk; hs = D['hs']; x, y, z = C.x, C.y, C.z; ax = np.abs(x); rng = np.random.default_rng(11)
    if verbose: print('  canvas baked', flush=True)
    ez = mk['eye_z']; nz, mz, mw = D['nz'], D['mz'], D['mw']
    eye_d = np.minimum(*[np.linalg.norm(C.pos - mk['eye'][s].astype(np.float32), axis=2) for s in 'lr']); r = mk['eye_r']
    near_eye = smoothstep((eye_d - (r + 0.12)) / 0.5)                                       # 0 on the lid edge: leave the lids' fit alone
    face = C.front
    # ---- the nose: a low pad, two deep nostrils with a rim, the septum between them
    H = np.zeros((S, S), np.float32); pit = np.zeros((S, S), np.float32)
    pad = np.exp(-((x / ((2.6 - 0.5 * np.clip((z - nz) / (1.5 * hs), -1, 1)) * hs)) ** 4 + ((z - (nz + 0.35 * hs)) / (1.5 * hs)) ** 4)) * face; H += 0.26 * hs * pad      # wider at the nostrils, narrowing toward the eyes
    for sg in (1, -1):
        cx, cz = sg * 1.08 * hs, nz; a = np.radians(28) * sg; dx, dz = x - cx, z - cz; u_ = dx * np.cos(a) + dz * np.sin(a); v_ = -dx * np.sin(a) + dz * np.cos(a)
        d = np.sqrt((u_ / (0.84 * hs)) ** 2 + (v_ / (0.52 * hs)) ** 2); hole = (1 - smoothstep((d - 0.45) / 0.6)) * face
        H -= 0.78 * hs * hole; pit = np.maximum(pit, hole)
        side = smoothstep((dx * sg + 0.1) / (0.6 * hs)); upper = smoothstep((dz + 0.3 * hs) / (0.7 * hs)); H += 0.20 * hs * np.exp(-((d - 1.25) / 0.34) ** 2) * np.maximum(side, upper * 0.8) * face
    H += 0.10 * hs * gauss(x, 0.24 * hs) * gauss(z - (nz + 0.1 * hs), 0.75 * hs) * face
    # ---- the lips: a thin raised rim either side of the mouth line (the line itself is real geometry)
    lip = gauss(z - mz, 0.30 * hs) * smoothstep((mw * 1.02 - ax) / (0.5 * hs)) * face; H += 0.05 * hs * lip
    # ---- creases
    H += C.strokes(D['major'], 0.075 * hs, 0.085 * hs) * near_eye
    H += C.strokes(D['medium'], 0.05 * hs, 0.05 * hs) * near_eye
    H += C.strokes(D['fine'], 0.03 * hs, 0.028 * hs, shoulder=0.2)
    scar = C.strokes(D['scars'], 0.07 * hs, 1.0, shoulder=0.0, taper=0.5); scar_m = np.clip(-scar, 0, 1); H += 0.035 * hs * scar_m          # healed proud of the skin
    if verbose: print('  creases drawn', flush=True)
    # ---- skin grain: a coarse and a fine net of creases, deeper where the skin folds most (around the eyes, on the muzzle)
    e1, id1 = C.cells(0.42 * hs, 3); e2, _ = C.cells(0.15 * hs, 5); soft = C.noise(2.2, 9)
    muzzle = np.exp(-((ax / (5.6 * hs)) ** 2 + ((z - (mz + 1.6 * hs)) / (3.9 * hs)) ** 2)) * face; eyes_ = np.exp(-((eye_d - r) / (2.0 * hs)) ** 2) * face
    worn = np.clip(0.45 + 0.55 * np.maximum(muzzle, eyes_) + 0.3 * (soft - 0.5), 0.2, 1.2)
    grain = -0.020 * hs * np.exp(-(e1 / 0.10) ** 2) * worn - 0.008 * hs * np.exp(-(e2 / 0.16) ** 2) + 0.006 * hs * (id1 - 0.5)
    H += grain * (0.35 + 0.65 * near_eye) * (1 - pit)
    if verbose: print('  grain done', flush=True)
    # ---- colour: near-black face, a worn mottled muzzle, paler rings round the eyes, freckles, dark creases, pale scars
    def rgb(hx): hx = hx.lstrip('#'); c = np.array([int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)    # hex is sRGB; paint in linear light
    lerp = lambda a, c, t: a + (c - a) * t[..., None]
    n1 = C.noise(1.3, 21); n2 = C.noise(0.45, 23, octaves=2); col = np.broadcast_to(rgb('#2a211d'), (S, S, 3)).copy()
    col = lerp(col, rgb('#3b302b'), np.clip((n1 - 0.4) * 2.2, 0, 1) * 0.7)
    wear = np.clip(muzzle * 1.25 * (0.35 + 1.1 * np.clip((n1 - 0.35) * 2.0, 0, 1)) * (0.6 + 0.8 * n2), 0, 1); col = lerp(col, rgb('#775d51'), wear * 0.78)
    col = lerp(col, rgb('#4a3b34'), np.clip(eyes_ * 0.75 * (0.5 + n2), 0, 1) * near_eye)
    spots, sid = C.cells(0.5 * hs, 31); fre = (sid > 0.72) * np.exp(-((1 - np.clip(spots, 0, 1)) / 0.55) ** 2) * (0.3 + muzzle + 0.5 * eyes_); col = lerp(col, rgb('#150e0c'), np.clip(fre * 0.85, 0, 1))
    spots2, sid2 = C.cells(0.9 * hs, 37); pale = (sid2 > 0.86) * np.exp(-((1 - np.clip(spots2, 0, 1)) / 0.5) ** 2) * muzzle; col = lerp(col, rgb('#977a6c'), np.clip(pale * 0.6, 0, 1))
    col = lerp(col, rgb('#644a42'), np.clip(lip * 0.5, 0, 1))
    crease = np.clip(-(H - 0.26 * hs * pad) / (0.06 * hs), 0, 1) * (1 - pit); col = col * (1 - 0.55 * crease[..., None])
    col = lerp(col, rgb('#050303'), np.clip(pit * 1.6, 0, 1)); col = lerp(col, rgb('#b08d7f'), scar_m * 0.8)
    rough = 0.50 - 0.10 * muzzle + 0.16 * crease - 0.14 * np.clip(lip, 0, 1) + 0.12 * (n2 - 0.5) + 0.1 * pit - 0.08 * scar_m
    # ---- write
    Image.fromarray(np.clip((0.5 + H / HRANGE) * 65535, 0, 65535).astype(np.uint16)).save(paths['height'])
    srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.clip(col, 1e-6, 1) ** (1 / 2.4) - 0.055)          # colours above are linear
    Image.fromarray((np.clip(srgb, 0, 1) * 255).astype(np.uint8)).save(paths['colour']); Image.fromarray((np.clip(rough, 0.05, 1) * 255).astype(np.uint8)).save(paths['rough'])
    open(stamp, 'w').write(key)
    if verbose: print('  maps written', flush=True)
    return dict(paths, uv=uv, mask=mask)


if __name__ == '__main__':
    import sys, time, ape
    t0 = time.time(); b = ape.build(); out = paint(b, int(sys.argv[1]) if len(sys.argv) > 1 else 2048, force=True, verbose=True); print({k: v for k, v in out.items() if isinstance(v, str)}, f'{time.time() - t0:.0f}s')
