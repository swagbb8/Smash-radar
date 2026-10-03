"""Field + stadium, generated from scratch: regulation field (yard lines, hash marks, numbers, painted end zones),
sideline team areas with benches, padded wall, two-deck bowl with a crowd, light towers, scoreboard, tunnel, goal
posts and pylons. Everything is in metres; textures are drawn with Pillow and cached in assets/stadium/cache.
"""
import math, os, random
import bpy, bmesh
from mathutils import Vector
from utils import ASSETS, YD, FIELD_LEN, FIELD_WID, hex_rgb, hex_linear, luminance, font, log

CACHE = os.path.join(ASSETS, 'stadium', 'cache')
DEFAULTS = {'length_yd': FIELD_LEN, 'width_yd': FIELD_WID, 'grass': ('#3f9a3c', '#47a843'), 'style': 'stripes', 'apron': '#2c7a2a', 'wall': '#12161d', 'seats': '#1b2029', 'crowd_density': 0.9}


def _img(path): return bpy.data.images.load(path, check_existing=True)


def _mat(name, base=None, rough=0.8, image=None, emit=0.0, metal=0.0, bump=None, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    if 'Coat Weight' in p.inputs: p.inputs['Coat Weight'].default_value = coat
    if base: p.inputs['Base Color'].default_value = base
    if image:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(image); nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
        if emit: nt.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    elif emit:
        p.inputs['Emission Color'].default_value = base; p.inputs['Emission Strength'].default_value = emit
    if bump:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = bump[0]; b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump[1]
        nt.links.new(n.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m


def _obj(name, bm, mats, coll, smooth=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob); return ob


def _box(bm, c, size, mat=0):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r['verts']: v.co = Vector((v.co.x * size[0] + c[0], v.co.y * size[1] + c[1], v.co.z * size[2] + c[2]))
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mat


def field_texture(home, away, cfg):
    """Top-down field painting. Left end zone (-x) is the offense's own, right (+x) is the one being attacked."""
    from PIL import Image, ImageDraw
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"field_{home['abbr']}_{home['primary'][1:]}_{away['abbr']}_{away['primary'][1:]}_{cfg['style']}.png")
    if os.path.exists(path): return path
    W, H = 4096, int(4096 * cfg['width_yd'] / cfg['length_yd']); im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im); sx = W / cfg['length_yd']; px = lambda yd: (yd + cfg['length_yd'] / 2) * sx
    g0, g1 = cfg['grass']
    for i in range(20): d.rectangle([px(-50 + i * 5), 0, px(-45 + i * 5), H], fill=g1 if (i % 2 and cfg['style'] != 'plain') else g0)
    rnd = random.Random(7); px_ = im.load()
    for _ in range(260000):                                      # grass grain
        x, y = rnd.randrange(W), rnd.randrange(H); r, g, b = px_[x, y]; k = rnd.choice((-9, -5, 6, 10)); px_[x, y] = (max(0, r + k), max(0, min(255, g + k)), max(0, b + k // 2))
    for team, a, b, rot in ((home, -60, -50, 90), (away, 50, 60, 270)):
        d.rectangle([px(a), 0, px(b), H], fill=team['primary'])
        txt = Image.new('RGBA', (H, int(px(b) - px(a))), (0, 0, 0, 0)); td = ImageDraw.Draw(txt); f = font('anton', txt.size[1] * 0.74); s = team['name'].upper(); box = td.textbbox((0, 0), s, font=f, stroke_width=10)
        fill = team['secondary'] if luminance(team['secondary']) > 0.35 else '#ffffff'
        td.text(((txt.size[0] - (box[2] - box[0])) / 2 - box[0], (txt.size[1] - (box[3] - box[1])) / 2 - box[1]), s, font=f, fill=fill, stroke_width=10, stroke_fill='#0c0e12')
        txt = txt.rotate(rot, expand=True); im.paste(txt, (int(px(a)), 0), txt)
    white = '#f6f6f6'
    for yd in range(-50, 51, 5): d.line([px(yd), 12, px(yd), H - 12], fill=white, width=9)
    for yd in range(-49, 50):
        if yd % 5 == 0: continue
        for yy in (0.022, 0.34, 0.66, 0.978): d.line([px(yd), yy * H - 16, px(yd), yy * H + 16], fill=white, width=5)
    d.rectangle([4, 4, W - 5, H - 5], outline=white, width=18)
    f = font('bold', 150)
    for yd in range(-40, 41, 10):
        n = str(50 - abs(yd))
        for yy, rot in ((H * 0.83, 0), (H * 0.17, 180)):
            t = Image.new('RGBA', (260, 190), (0, 0, 0, 0)); td = ImageDraw.Draw(t); box = td.textbbox((0, 0), n, font=f); td.text(((260 - (box[2] - box[0])) / 2 - box[0], (190 - (box[3] - box[1])) / 2 - box[1]), n, font=f, fill=white)
            t = t.rotate(rot); im.paste(t, (int(px(yd) - 130), int(yy - 95)), t)
    r = 0.062 * W; cx, cy = px(0), H / 2; d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=home['primary'], outline=white, width=12)
    f = font('anton', r * 0.9); box = d.textbbox((0, 0), home['abbr'], font=f); d.text((cx - (box[2] - box[0]) / 2 - box[0], cy - (box[3] - box[1]) / 2 - box[1]), home['abbr'], font=f, fill='#ffffff')
    im.save(path); return path


def _grass(m):
    """Real-turf look on top of the painted field: patchy colour, mowing sheen, blade-scale bump and roughness."""
    nt = m.node_tree; p = nt.nodes['Principled BSDF']; img = next(n for n in nt.nodes if n.type == 'TEX_IMAGE'); tc = nt.nodes.new('ShaderNodeTexCoord')
    def noise(scale, detail, rough=0.6):
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough; nt.links.new(tc.outputs['Object'], n.inputs['Vector']); return n
    patch, fine, blade = noise(0.12, 4.0), noise(6.0, 3.0), noise(160.0, 2.0)
    def mul(col, fac_node, lo, hi):
        r = nt.nodes.new('ShaderNodeMapRange'); r.inputs['To Min'].default_value = lo; r.inputs['To Max'].default_value = hi; nt.links.new(fac_node.outputs['Fac'], r.inputs['Value'])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0; nt.links.new(col, mx.inputs['A'])
        c = nt.nodes.new('ShaderNodeCombineColor'); [nt.links.new(r.outputs['Result'], c.inputs[i]) for i in range(3)]; nt.links.new(c.outputs['Color'], mx.inputs['B']); return mx.outputs['Result']
    col = mul(mul(mul(img.outputs['Color'], patch, 0.78, 1.08), fine, 0.86, 1.06), blade, 0.80, 1.10); nt.links.new(col, p.inputs['Base Color'])
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.55; b.inputs['Distance'].default_value = 0.02; nt.links.new(blade.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = 0.78
    if 'Sheen Weight' in p.inputs: p.inputs['Sheen Weight'].default_value = 0.08


def crowd_texture(home, away, density):
    """Seated fans, row by row: muted clothing with team colours mixed in, varied skin and hair, dark gaps between rows."""
    from PIL import Image, ImageDraw, ImageFilter
    os.makedirs(CACHE, exist_ok=True); path = os.path.join(CACHE, f"crowd3_{home['primary'][1:]}_{away['primary'][1:]}_{int(density * 100)}.png")
    if os.path.exists(path): return path
    W, H = 4096, 2048; im = Image.new('RGB', (W, H), '#0d0f14'); d = ImageDraw.Draw(im); rnd = random.Random(3)
    def shade(h, k): return tuple(int(min(255, c * 255 * k)) for c in hex_rgb(h))
    neutral = ['#2a2f3a', '#3b4250', '#1c1f27', '#555c69', '#6d6a63', '#8a8780', '#c9c7c1', '#3a3026', '#27364a', '#4a2f2f']; skins = ['#d8a67c', '#7a4a2a', '#b8805a', '#e6bd98', '#5a3620', '#c79268']; hairs = ['#15110d', '#2a1c12', '#4a3423', '#8a7a66', '#1d1d20']
    rows = 60; rh = H / rows; cols = 250; cw = W / cols
    for r in range(rows):
        d.rectangle([0, r * rh + rh * 0.86, W, (r + 1) * rh], fill='#07080b')
        for i in range(cols):
            if rnd.random() > density: continue
            x = i * cw + (r % 2) * cw * 0.5 + rnd.uniform(-1.5, 1.5); y = r * rh + rnd.uniform(-1, 1); k = rnd.uniform(0.55, 1.0); u = rnd.random()
            c = shade(home['primary'], k) if u < 0.34 else shade(home['secondary'], k * 0.9) if u < 0.42 else shade(away['primary'], k) if u < 0.5 else shade(rnd.choice(neutral), k + 0.15)
            bw = cw * rnd.uniform(0.62, 0.8); d.rounded_rectangle([x, y + rh * 0.40, x + bw, y + rh * 0.9], radius=3, fill=c)
            hw = bw * 0.46; hx = x + (bw - hw) / 2; sk = shade(rnd.choice(skins), rnd.uniform(0.8, 1.0)); d.ellipse([hx, y + rh * 0.10, hx + hw, y + rh * 0.44], fill=sk)
            if rnd.random() < 0.75: d.pieslice([hx - 0.5, y + rh * 0.07, hx + hw + 0.5, y + rh * 0.40], 180, 360, fill=shade(rnd.choice(hairs + [home['primary']]), 0.9))
            if rnd.random() < 0.12: d.line([x + bw * 0.5, y + rh * 0.45, x + bw * rnd.choice((0.0, 1.0)), y - rh * 0.1], fill=sk, width=3)      # arms up
    im = im.filter(ImageFilter.GaussianBlur(0.6)); im.save(path); return path


def board_texture(home, away, score, quarter, clock):
    from PIL import Image, ImageDraw
    os.makedirs(CACHE, exist_ok=True); path = os.path.join(CACHE, f"board_{home['abbr']}{score[0]}_{away['abbr']}{score[1]}_{quarter}_{clock.replace(':', '')}.png")
    W, H = 1280, 512; im = Image.new('RGB', (W, H), '#080b10'); d = ImageDraw.Draw(im)
    for i, (t, s) in enumerate(((home, score[0]), (away, score[1]))):
        x0 = 40 + i * 620; d.rounded_rectangle([x0, 60, x0 + 580, 330], 26, fill=t['primary'])
        d.text((x0 + 36, 90), t['abbr'], font=font('anton', 150), fill='#ffffff'); f = font('anton', 200); b = d.textbbox((0, 0), str(s), font=f); d.text((x0 + 548 - (b[2] - b[0]) - b[0], 78), str(s), font=f, fill='#ffffff')
    d.text((60, 370), f'{quarter}  {clock}', font=font('bold', 90), fill='#c6ff3d'); f = font('anton', 90); b = d.textbbox((0, 0), 'SMASH 3D', font=f); d.text((W - 60 - (b[2] - b[0]), 368), 'SMASH 3D', font=f, fill='#ffffff')
    im.save(path); return path


def _bowl(bm, a0, b0, a1, b1, z0, z1, mat, n=96, e=3.2, reps=8.0, uv=None):
    """A ring of raked seating between two super-ellipses (rounded-rectangle bowl)."""
    def ring(a, b, z):
        out = []
        for k in range(n):
            t = 2 * math.pi * k / n; c, s = math.cos(t), math.sin(t)
            out.append(bm.verts.new((a * math.copysign(abs(c) ** (2 / e), c), b * math.copysign(abs(s) ** (2 / e), s), z)))
        return out
    r0, r1 = ring(a0, b0, z0), ring(a1, b1, z1)
    for k in range(n):
        f = bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k])); f.material_index = mat; f.smooth = True
        if uv:
            for lp, (u, v) in zip(f.loops, ((k / n, 0), ((k + 1) / n, 0), ((k + 1) / n, 1), (k / n, 1))): lp[uv].uv = (u * reps, v)


def build(coll, home, away, cfg=None, score=(0, 0), quarter='Q1', clock='8:47'):
    """Build the whole venue into `coll`. home/away are team dicts (the offense attacks the +x end zone, which is away's)."""
    cfg = dict(DEFAULTS, **(cfg or {})); Lm, Wm = cfg['length_yd'] * YD, cfg['width_yd'] * YD; objs = {}
    # ---- playing surface
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap'); vs = [bm.verts.new((sx * Lm / 2, sy * Wm / 2, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]; f = bm.faces.new(vs)
    for lp, u in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uv].uv = u
    objs['field'] = _obj('Field', bm, [_mat('field', rough=0.92, image=field_texture(home, away, cfg), bump=(2600, 0.12))], coll)
    _grass(bpy.data.materials['field'])
    bm = bmesh.new(); A, Bv = Lm / 2 + 16, Wm / 2 + 13
    bm.faces.new([bm.verts.new((sx * A, sy * Bv, -0.02)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    # white team-area boxes + benches on both sidelines, coach's box, pylons
    for sy, team in ((1, home), (-1, away)):
        y = sy * (Wm / 2 + 5.5)
        for x in (-14, -7, 0, 7, 14): _box(bm, (x, y + sy * 2.2, 0.25), (5.2, 0.6, 0.5), 2 if team is home else 3); _box(bm, (x, y + sy * 2.5, 0.6), (5.2, 0.12, 0.7), 2 if team is home else 3)
        _box(bm, (0, sy * (Wm / 2 + 3.2), -0.005), (46, 0.3, 0.02), 1); _box(bm, (0, sy * (Wm / 2 + 1.9), -0.008), (Lm, 1.9 * 2 - 0.2, 0.01), 1)
    for X in (-50 * YD, 50 * YD, -60 * YD, 60 * YD):
        for Y in (-Wm / 2, Wm / 2): _box(bm, (X, Y, 0.23), (0.12, 0.12, 0.46), 4)
    objs['apron'] = _obj('Apron', bm, [_mat('apron', hex_linear(cfg['apron']), 0.95, bump=(2000, 0.1)), _mat('white_paint', hex_linear('#f2f2f2'), 0.8), _mat('bench_home', hex_linear(home['primary']), 0.5),
                                       _mat('bench_away', hex_linear(away['primary']), 0.5), _mat('pylon', hex_linear('#ff6a00'), 0.6, emit=0.4)], coll)
    # ---- padded wall, lower + upper bowl with crowd, concourse band, roof rim
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap'); a, b = A + 1, Bv + 1
    _bowl(bm, a, b, a, b, 0, 2.6, 0, e=3.4, reps=6, uv=uv)
    _bowl(bm, a, b, a + 26, b + 24, 2.6, 19, 1, e=3.2, reps=5, uv=uv)
    _bowl(bm, a + 26, b + 24, a + 26, b + 24, 19, 24.5, 2, e=3.2)
    _bowl(bm, a + 27, b + 25, a + 47, b + 43, 24.5, 42, 1, e=3.0, reps=6, uv=uv)
    _bowl(bm, a + 47, b + 43, a + 49, b + 45, 42, 47, 2, e=3.0)
    from PIL import Image, ImageDraw
    os.makedirs(CACHE, exist_ok=True); wp = os.path.join(CACHE, f"wall_{home['abbr']}_{home['primary'][1:]}_{away['abbr']}_{away['primary'][1:]}.png")
    if not os.path.exists(wp):
        im = Image.new('RGB', (2048, 128), home['primary']); d = ImageDraw.Draw(im); d.rectangle([1024, 0, 2048, 128], fill=away['primary'])
        for i, t in enumerate((home['name'].upper(), 'SMASH 3D', away['name'].upper(), 'SMASH 3D')):
            f = font('anton', 84); bx = d.textbbox((0, 0), t, font=f); d.text((i * 512 + (512 - (bx[2] - bx[0])) / 2 - bx[0], (128 - (bx[3] - bx[1])) / 2 - bx[1]), t, font=f, fill='#ffffff')
        im = im.transpose(Image.FLIP_LEFT_RIGHT); im.save(wp)
    objs['bowl'] = _obj('Stadium', bm, [_mat('wall', rough=0.55, image=wp, emit=0.25), _mat('crowd', rough=0.9, image=crowd_texture(home, away, cfg['crowd_density']), emit=0.10), _mat('concrete', hex_linear(cfg['seats']), 0.8)], coll, smooth=True)
    # ---- light towers (the lamps themselves live in lighting.py), scoreboard, tunnel
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (a + 40), sy * (b + 36); _box(bm, (x, y, 28), (1.6, 1.6, 56), 0); _box(bm, (x, y, 58), (15, 15, 7), 0)
            _box(bm, (x - sx * 5.6, y - sy * 5.6, 58), (11, 11, 5.6), 1)                     # the glowing lamp bank, facing the field
    objs['towers'] = _obj('LightTowers', bm, [_mat('steel', hex_linear('#2a2f38'), 0.5, metal=0.7), _mat('lamps', hex_linear('#fff4d6'), 0.4, emit=38.0)], coll)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap'); X = Lm / 2 + 44; w, h, z = 34, 13.6, 30
    _box(bm, (X + 0.8, 0, z), (1.4, w + 2.4, h + 2.4), 1); _box(bm, (X + 0.4, -w / 2 + 2, z / 2 - 3), (1.2, 1.6, z - 6), 1); _box(bm, (X + 0.4, w / 2 - 2, z / 2 - 3), (1.2, 1.6, z - 6), 1)
    vs = [bm.verts.new((X, sy * w / 2, z + sz * h / 2)) for sy, sz in ((1, -1), (-1, -1), (-1, 1), (1, 1))]; f = bm.faces.new(vs); f.material_index = 0
    for lp, u in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uv].uv = u
    objs['scoreboard'] = _obj('Scoreboard', bm, [_mat('screen', rough=0.3, image=board_texture(home, away, score, quarter, clock), emit=2.2), _mat('frame', hex_linear('#14181f'), 0.5, metal=0.5)], coll)
    bm = bmesh.new(); _box(bm, (-(A + 1.5), -(Bv - 6), 1.7), (5, 7, 3.4), 0); objs['tunnel'] = _obj('Tunnel', bm, [_mat('tunnel', hex_linear('#020304'), 1.0)], coll)
    # ---- regulation goal posts (gooseneck behind the end line, crossbar 10 ft, uprights 18'6" apart)
    bm = bmesh.new()
    def cyl(p0, p1, r, mat=0):
        d = Vector(p1) - Vector(p0); res = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r, radius2=r, depth=d.length)
        rot = d.to_track_quat('Z', 'Y').to_matrix()
        for v in res['verts']: v.co = rot @ v.co + (Vector(p0) + Vector(p1)) / 2
        for f in {f for v in res['verts'] for f in v.link_faces}: f.material_index = mat; f.smooth = True
    for sx in (-1, 1):
        X = sx * 60 * YD; cyl((X + sx * 1.9, 0, 0), (X + sx * 1.9, 0, 2.55), 0.13); cyl((X + sx * 1.9, 0, 2.55), (X, 0, 2.85), 0.11); cyl((X, 0, 2.85), (X, 0, 3.05), 0.1); cyl((X, -2.82, 3.05), (X, 2.82, 3.05), 0.085)
        for sy in (-1, 1): cyl((X, sy * 2.82, 3.05), (X, sy * 2.82, 13.7), 0.065)
        cyl((X + sx * 1.9, 0, 0), (X + sx * 1.9, 0, 1.85), 0.3, 1 if sx < 0 else 2)
    objs['posts'] = _obj('GoalPosts', bm, [_mat('post_yellow', hex_linear('#ffd21f'), 0.3, coat=0.6), _mat('pad_home', hex_linear(home['primary']), 0.6), _mat('pad_away', hex_linear(away['primary']), 0.6)], coll, smooth=False)
    log(f'stadium built: {len(objs)} objects, field {Lm:.1f} x {Wm:.1f} m')
    objs['_dims'] = {'a': a, 'b': b, 'length': Lm, 'width': Wm}
    return objs
