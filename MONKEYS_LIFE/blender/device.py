"""The device in Seven's left forearm.

Ash's words: "a device dug into my arm ... the screen was shattered, it fit the size of my palm, I never seen anything
like it." It is fused into him: scar tissue has grown up around the frame and fine circuit lines run out from it under
the skin of the forearm. When it wakes it gives a cold blue pulse.

This module is pure numpy + PIL (no Blender): the shape, where it sits, and the painted maps. seven.py turns it into
an object and materials.

    layout(b)          -> where it sits on the arm (centre, half sizes, the arm's axis)
    coords(b, P)       -> for skin points: position in device space (u along the arm, v around it, both in cm) and masks
    mesh(b)            -> the frame + glass as vertices/faces in rest space
    maps()             -> painted textures: cracks + display for the glass, scar + traces for the skin
"""
import hashlib, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import basemesh as bm
from basemesh import smoothstep

A, B, RC = 4.2, 2.6, 0.85          # half length along the arm, half width around it, corner radius (cm)
FRAME = 0.52                       # width of the metal frame around the glass
PROUD = 0.26                       # how far the frame stands above the skin
SKIN_U, SKIN_V = 3.4, 2.6          # the skin map covers +-SKIN_U * A along the arm and +-SKIN_V * B around it
CACHE = os.path.join(bm.ROOT, 'assets', 'seven')


def layout(b):
    """Where it sits: centred half way down the forearm, lying along the top of the arm (which slopes, the arm being thicker at the elbow)."""
    J = b['J']; P = b['V']; ex, wx = J['LeftForeArm'][0], J['LeftHand'][0]; ay, az = J['LeftForeArm'][1], J['LeftForeArm'][2]; cx = ex + 0.50 * (wx - ex)
    wf = b['W'][:, b['bones'].index('LeftForeArm')]; u = P[:, 0] - cx; dy, dz = P[:, 1] - ay, P[:, 2] - az; rr = np.hypot(dy, dz); phi = np.arctan2(dy, dz); v = np.maximum(rr, 2.5) * phi
    top = (wf > 0.3) & (P[:, 0] > 0) & (np.cos(phi) > 0.80) & (np.abs(u) < A + 3.0) & (sd(u, v) > -0.2) & (b['ids'] < bm.NBODY)       # skin around it, not the skin pushed down under it
    if top.sum() >= 4: c1, c0 = np.polyfit(u[top], P[top, 2], 1)
    else: c1, c0 = 0.0, az + 4.0
    return dict(c=np.array([cx, ay, c0]), axis=np.array([ay, az]), r=c0 - az, slope=float(c1))


def coords(b, P=None):
    """Device space for points on the left forearm: u = cm along the arm from the centre, v = cm around the arm from the top.
    -> dict(u, v, inside (0..1 under the device), ring (0..1 scar tissue around it), bare (0..1 no hair), on (which points count))"""
    L = layout(b); P = b['V'] if P is None else P; N = b['N']; bi = {n: i for i, n in enumerate(b['bones'])}; W = b['W']
    on = smoothstep((W[:, bi['LeftForeArm']] + W[:, bi['LeftArm']] * 0.5 + W[:, bi['LeftHand']] * 0.5 - 0.3) / 0.3) * (P[:, 0] > 0) * (b['ids'] < bm.NBODY)
    dy, dz = P[:, 1] - L['axis'][0], P[:, 2] - L['axis'][1]; rr = np.hypot(dy, dz); phi = np.arctan2(dy, dz); u = P[:, 0] - L['c'][0]; v = np.maximum(rr, 2.5) * phi
    d = sd(u, v); top = smoothstep((np.cos(phi) + 0.25) / 0.5)
    return dict(u=u, v=v, d=d, inside=smoothstep(-d / 0.4) * on * top, ring=smoothstep((1.0 - d) / 0.5) * smoothstep((d + 0.25) / 0.3) * on * top, bare=smoothstep((1.3 - d) / 0.9) * on * top, on=on)


def sd(u, v, shrink=0.0):
    """Signed distance (cm) to the device outline: negative inside."""
    a, b_, r = A - shrink, B - shrink, max(RC - shrink, 0.05); qx = np.abs(u) - (a - r); qy = np.abs(v) - (b_ - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def mesh(b, nu=76, nv=48):
    """-> (verts (n, 3) in rest space, faces, material index per face [0 frame, 1 glass], uv (n, 2) over the glass, edge wear (n,))"""
    L = layout(b); us = np.linspace(-A, A, nu); vs = np.linspace(-B, B, nv); U, Vv = np.meshgrid(us, vs, indexing='ij'); U = U.copy(); Vv = Vv.copy()
    # pull the grid's corners onto the rounded outline
    qx = np.abs(U) - (A - RC); qy = np.abs(Vv) - (B - RC); corner = (qx > 0) & (qy > 0); ln = np.hypot(qx, qy); k = np.where(corner & (ln > RC), RC / np.maximum(ln, 1e-6), 1.0)
    U = np.where(corner, np.sign(U) * ((A - RC) + qx * k), U); Vv = np.where(corner, np.sign(Vv) * ((B - RC) + qy * k), Vv)
    d = sd(U, Vv); glass = smoothstep((-d - FRAME) / 0.05)                                 # 1 on the screen
    bevel = smoothstep(-d / 0.13); h = PROUD * (0.25 + 0.75 * bevel) - 0.085 * glass       # frame rises from a bevelled edge; the glass sits a little lower
    th = np.arctan(L['slope']); ct, st = np.cos(th), np.sin(th)
    def place(u, v, h_):                                                                    # wrap gently round the arm, lie along its slope
        Rb = 9.5; ang = v / Rb; up = (Rb + h_) * np.cos(ang) - Rb - 0.16
        return np.stack([L['c'][0] + u * ct - up * st, L['c'][1] + (Rb + h_) * np.sin(ang), L['c'][2] + u * st + up * ct], -1)
    top = place(U, Vv, h).reshape(-1, 3); idx = np.arange(nu * nv).reshape(nu, nv); F = []; M = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            F.append((idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1])); M.append(1 if glass[i:i + 2, j:j + 2].min() > 0.5 else 0)
    # the wall going down into the arm
    rim = np.concatenate([idx[:, 0], idx[-1, 1:], idx[-2::-1, -1], idx[0, -2:0:-1]]); Ur, Vr = U.reshape(-1)[rim], Vv.reshape(-1)[rim]; low = place(Ur, Vr, np.full(len(rim), -1.3)); base = len(top)
    for q in range(len(rim)):
        q2 = (q + 1) % len(rim); F.append((rim[q2], rim[q], base + q, base + q2)); M.append(0)
    V = np.concatenate([top, low]); uv = np.zeros((len(V), 2), np.float32); uv[:nu * nv, 0] = (U.reshape(-1) / (A - FRAME) + 1) / 2; uv[:nu * nv, 1] = (Vv.reshape(-1) / (B - FRAME) + 1) / 2
    wear = np.zeros(len(V), np.float32); wear[:nu * nv] = (np.exp(-((d + 0.07) / 0.06) ** 2) + 0.6 * np.exp(-((d + FRAME) / 0.05) ** 2)).reshape(-1)
    fuv = np.zeros((len(V), 2), np.float32); fuv[:nu * nv, 0] = (U.reshape(-1) / A + 1) / 2; fuv[:nu * nv, 1] = (Vv.reshape(-1) / B + 1) / 2
    return V, F, M, uv, wear, fuv


# ------------------------------------------------------------------------------------------------ painting
def _crack_lines(rng, w, h):
    """A shattered screen: cracks running out from where it was hit, rings joining them near the impact, a few strays."""
    cx, cy = w * 0.63, h * 0.40; lines = []; rays = []; n = 17
    for i in range(n):
        ang = 2 * np.pi * (i + rng.uniform(-0.35, 0.35)) / n; p = np.array([cx, cy]); pts = [p.copy()]; step = w * 0.022
        while -5 < p[0] < w + 5 and -5 < p[1] < h + 5 and len(pts) < 160:
            ang += rng.normal(0, 0.055); p = p + step * np.array([np.cos(ang), np.sin(ang)]); pts.append(p.copy())
            if len(pts) > 8 and rng.random() < 0.035:                                       # a branch
                a2 = ang + rng.choice([-1, 1]) * rng.uniform(0.35, 0.8); q = p.copy(); br = [q.copy()]
                for _ in range(int(rng.integers(8, 40))): a2 += rng.normal(0, 0.07); q = q + step * np.array([np.cos(a2), np.sin(a2)]); br.append(q.copy())
                lines.append((br, 0.6))
        rays.append(pts); lines.append((pts, 1.0))
    for ring, rad in enumerate((0.045, 0.085, 0.14, 0.21, 0.30)):                            # rings: straight pieces from one crack to the next
        for i in range(n):
            if rng.random() < 0.22 + 0.1 * ring: continue
            a_, b_ = rays[i], rays[(i + 1) % n]; ka = min(len(a_) - 1, int(rad * w / (w * 0.022) * rng.uniform(0.85, 1.15))); kb = min(len(b_) - 1, int(rad * w / (w * 0.022) * rng.uniform(0.85, 1.15)))
            lines.append(([a_[ka], b_[kb]], 0.8))
    for _ in range(7):                                                                      # old scratches
        p = np.array([rng.uniform(0, w), rng.uniform(0, h)]); ang = rng.uniform(0, np.pi); L_ = rng.uniform(0.08, 0.3) * w; lines.append(([p, p + L_ * np.array([np.cos(ang), np.sin(ang)])], 0.3))
    return lines, (cx, cy)


def maps(force=False):
    """-> {'glass': path (R cracks, G crushed glass at the impact, B the display), 'skin': path (R traces, G scar ring, B the traces' glow)}"""
    os.makedirs(CACHE, exist_ok=True); key = hashlib.sha1(open(__file__, 'rb').read()).hexdigest()[:10]; paths = dict(glass=os.path.join(CACHE, 'device_glass.png'), skin=os.path.join(CACHE, 'device_skin.png')); stamp = os.path.join(CACHE, 'device.key')
    if not force and all(os.path.exists(p) for p in paths.values()) and os.path.exists(stamp) and open(stamp).read().strip() == key: return paths
    rng = np.random.default_rng(19); SS = 3; w = 1024; h = int(w * (B - FRAME) / (A - FRAME)); W_, H_ = w * SS, h * SS
    # --- cracks
    lines, hit = _crack_lines(rng, W_, H_); im = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(im)
    for pts, strength in lines: dr.line([tuple(map(float, p)) for p in pts], fill=int(255 * strength), width=max(1, int(SS * (1.0 + 0.9 * strength))))
    crack = np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255
    yy, xx = np.mgrid[0:h, 0:w]; dh = np.hypot(xx - hit[0] / SS, yy - hit[1] / SS) / w
    crush = np.clip(1.25 - dh / 0.05, 0, 1) * (0.55 + 0.45 * rng.random((h, w))); crush = np.asarray(Image.fromarray((crush * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    # --- what is left of the display: a flat line with one beat in it, a ring, a few blocks, most of it dead
    ui = Image.new('L', (W_, H_), 0); du = ImageDraw.Draw(ui); lw = 2 * SS
    y0 = H_ * 0.66; xs = np.linspace(W_ * 0.06, W_ * 0.94, 220); beat = np.exp(-((xs - W_ * 0.34) / (W_ * 0.012)) ** 2) * H_ * 0.26 - np.exp(-((xs - W_ * 0.365) / (W_ * 0.010)) ** 2) * H_ * 0.12 + np.exp(-((xs - W_ * 0.31) / (W_ * 0.012)) ** 2) * H_ * 0.035
    du.line([(float(x_), float(y0 - b_)) for x_, b_ in zip(xs, beat)], fill=255, width=lw)
    r0 = H_ * 0.17; cxr, cyr = W_ * 0.2, H_ * 0.30
    du.ellipse([cxr - r0, cyr - r0, cxr + r0, cyr + r0], outline=200, width=lw); du.arc([cxr - r0 * 1.35, cyr - r0 * 1.35, cxr + r0 * 1.35, cyr + r0 * 1.35], 200, 320, fill=150, width=lw); du.ellipse([cxr - 3 * SS, cyr - 3 * SS, cxr + 3 * SS, cyr + 3 * SS], fill=255)
    for i in range(9):
        bx = W_ * (0.42 + 0.036 * i); bh = H_ * rng.uniform(0.03, 0.16); du.rectangle([bx, H_ * 0.34 - bh, bx + W_ * 0.02, H_ * 0.34], fill=int(rng.uniform(70, 190)))
    for i in range(5): du.line([(W_ * 0.42, H_ * (0.40 + 0.035 * i)), (W_ * rng.uniform(0.50, 0.74), H_ * (0.40 + 0.035 * i))], fill=110, width=max(1, SS))
    ui = np.asarray(ui.resize((w, h), Image.LANCZOS), np.float32) / 255
    dead = np.ones((h, w), np.float32)
    for _ in range(6): x0 = int(rng.uniform(0, w)); dead[:, x0:x0 + int(rng.uniform(4, 46))] *= rng.uniform(0.0, 0.35)                       # dead columns
    dead *= np.clip(dh / 0.16, 0.0, 1) ** 1.5; dead *= 0.82 + 0.18 * (yy % 3 > 0)                                                            # nothing left where it was hit; scan lines
    ui = ui * dead; glow = np.asarray(Image.fromarray((ui * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7)), np.float32) / 255
    disp = np.clip(ui + 0.30 * glow + 0.008 * dead, 0, 1)
    Image.fromarray((np.stack([crack, crush, disp], -1) * 255).astype(np.uint8)).save(paths['glass'])
    # --- the skin around it: scar tissue hugging the frame, a seam running up and down the arm, circuit lines under the skin
    sw = 1280; sh = int(sw * (SKIN_V * B) / (SKIN_U * A)); SW, SH = sw * SS, sh * SS; ppc = SW / (2 * SKIN_U * A)                               # texels per cm
    to = lambda u, v: (float((u / (SKIN_U * A) + 1) / 2 * SW), float((v / (SKIN_V * B) + 1) / 2 * SH))
    tr = Image.new('L', (SW, SH), 0); dt = ImageDraw.Draw(tr); tw = max(2, int(0.038 * ppc))
    def trace(p, direction, depth=0):
        """A printed-circuit line: straight runs with 45-degree bends, ending in a pad; now and then it forks."""
        pts = [p]; a0 = np.round(np.arctan2(direction[1], direction[0]) / (np.pi / 4)) * (np.pi / 4); d_ = np.array([np.cos(a0), np.sin(a0)]); total = rng.uniform(2.0, 7.5) * (0.6 ** depth); run = 0.0
        while run < total:
            seg = rng.uniform(0.5, 1.6); q = pts[-1] + d_ * seg; pts.append(q); run += seg
            if rng.random() < 0.5: a_ = np.arctan2(d_[1], d_[0]) + np.radians(rng.choice([-45, 45])); a_ = np.round(a_ / (np.pi / 4)) * (np.pi / 4); d_ = np.array([np.cos(a_), np.sin(a_)])     # circuit boards turn in 45-degree steps
            if depth < 2 and rng.random() < 0.22: trace(q, [d_[0], d_[1] + rng.choice([-0.7, 0.7])], depth + 1)
        dt.line([to(*q) for q in pts], fill=255, width=tw, joint='curve'); e = to(*pts[-1]); rp = 0.065 * ppc; dt.ellipse([e[0] - rp, e[1] - rp, e[0] + rp, e[1] + rp], fill=255)
    for side in (-1, 1):                                                                    # most leave from the two ends, along the arm
        for vv in np.linspace(-B * 0.7, B * 0.7, 6): trace(np.array([side * (A + 0.05), vv + rng.uniform(-0.12, 0.12)]), [side, rng.uniform(-0.25, 0.25)])
        for uu in np.linspace(-A * 0.75, A * 0.75, 5): trace(np.array([uu + rng.uniform(-0.2, 0.2), side * (B + 0.05)]), [rng.uniform(-0.8, 0.8), side * 0.6])
    tr = np.asarray(tr.resize((sw, sh), Image.LANCZOS), np.float32) / 255
    vv, uu = np.mgrid[0:sh, 0:sw]; ucm = (uu / sw * 2 - 1) * SKIN_U * A; vcm = (vv / sh * 2 - 1) * SKIN_V * B; d = sd(ucm, vcm)
    lump = np.asarray(Image.fromarray((rng.random((sh, sw)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    ring = np.clip(1 - np.abs(d - 0.32) / (0.48 + 0.5 * (lump - 0.5)), 0, 1) * (d > -0.12)
    seam = np.exp(-(vcm / 0.11) ** 2) * (np.abs(ucm) > A + 0.4) * np.clip((SKIN_U * A - 0.6 - np.abs(ucm)) / 1.5, 0, 1); stitch = 0.5 + 0.5 * np.cos(ucm * 2 * np.pi / 0.7)
    scar = np.clip(ring + seam * (0.55 + 0.45 * stitch), 0, 1); tr = tr * (d > 0.05)
    halo = np.asarray(Image.fromarray((tr * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    Image.fromarray((np.stack([tr, scar, np.clip(halo * 1.6, 0, 1)], -1) * 255).astype(np.uint8)).save(paths['skin'])
    open(stamp, 'w').write(key); return paths


if __name__ == '__main__':
    import ape
    p = maps(force=True); print(p); b = ape.build(); print(layout(b)); V, F, M, uv, wear, fuv = mesh(b); print('device mesh', len(V), 'verts', len(F), 'faces', 'glass faces', sum(M))
    c = coords(b); print({k: round(float(np.sum(v)), 1) for k, v in c.items() if k in ('inside', 'ring', 'bare')})
