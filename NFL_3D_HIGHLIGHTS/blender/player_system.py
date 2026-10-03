"""Player system: one reusable football player (skeleton + body + full uniform + helmet) built procedurally, then
instanced 22 times with per-team materials and per-player numbers.

The skeleton and locomotion clips come from assets/animations/*.glb (Mixamo-compatible rig). The body, pads, helmet,
facemask, visor, gloves and cleats are generated here, so there is no dependency on any character asset.
All modelling is done in the armature's rest space: centimetres, +X = player's left, -Y = forward, +Z = up.
"""
import math, os
import bpy, bmesh
from mathutils import Vector, Matrix
from utils import ASSETS, hex_linear, luminance, font, log

PRE = 'mixamorig:'
SLOTS = ['jersey', 'pants', 'skin', 'helmet', 'trim', 'sock', 'cleat', 'glove', 'mask', 'visor', 'number', 'sole']
SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#6b4226', '#a0673c']
SHOULDER_WIDEN = 4.3          # cm each side: athletic shoulders on the stock skeleton
# height / build by position (multipliers on a 6'2" base)
BUILD = {'QB': (1.02, 1.0), 'RB': (0.97, 1.04), 'WR': (1.0, 0.95), 'TE': (1.04, 1.06), 'OL': (1.05, 1.2), 'DL': (1.04, 1.18), 'LB': (1.01, 1.08), 'CB': (0.98, 0.95), 'S': (0.99, 0.97), 'K': (0.95, 0.92), 'P': (0.97, 0.94)}
ATTRS = {'QB': dict(speed=72, acceleration=74, agility=76, strength=62), 'RB': dict(speed=90, acceleration=92, agility=90, strength=74), 'WR': dict(speed=94, acceleration=92, agility=92, strength=60),
         'TE': dict(speed=82, acceleration=80, agility=76, strength=80), 'OL': dict(speed=54, acceleration=60, agility=50, strength=94), 'DL': dict(speed=66, acceleration=74, agility=62, strength=92),
         'LB': dict(speed=82, acceleration=84, agility=78, strength=84), 'CB': dict(speed=93, acceleration=92, agility=93, strength=58), 'S': dict(speed=90, acceleration=89, agility=88, strength=66),
         'K': dict(speed=60, acceleration=60, agility=60, strength=50), 'P': dict(speed=62, acceleration=62, agility=60, strength=52)}

# torso profile: (z, half-width x, half-depth y, centre y, {bone: weight}, squareness)
TORSO = [
    (91, 13.5, 10.5, 0.0, {'Hips': 1}, 2.2), (99, 17.5, 12.5, 0.2, {'Hips': 1}, 2.3), (108, 16.0, 11.6, 0.0, {'Hips': .6, 'Spine': .4}, 2.3), (116, 15.6, 11.4, -0.3, {'Spine': .7, 'Spine1': .3}, 2.3),
    (125, 17.5, 12.6, -0.6, {'Spine1': .7, 'Spine2': .3}, 2.4), (134, 21.5, 14.4, -0.6, {'Spine2': 1}, 2.6), (141, 27.0, 15.6, 0.2, {'Spine2': 1}, 2.9), (147, 28.5, 15.2, 0.8, {'Spine2': 1}, 3.0),
    (151.5, 22.0, 13.0, 1.4, {'Spine2': 1}, 2.6), (154, 10.5, 9.0, 2.2, {'Spine2': .6, 'Neck': .4}, 2.0), (157, 6.6, 6.8, 2.4, {'Neck': 1}, 2.0), (161, 6.2, 6.5, 1.8, {'Neck': .5, 'Head': .5}, 2.0),
]


def _sup(a, e):
    c = math.cos(a); return math.copysign(abs(c) ** (2.0 / e), c)


class _Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.w = {}; self.uv = self.bm.loops.layers.uv.new('UVMap')

    def ring(self, c, u, v, a, b, n=14, sq=2.0):
        return [c + u * (a * _sup(2 * math.pi * k / n, sq)) + v * (b * _sup(2 * math.pi * k / n - math.pi / 2, sq)) for k in range(n)]

    def add(self, pts, weights):
        vs = [self.bm.verts.new(p) for p in pts]
        for v in vs: self.w[v] = dict(weights)
        return vs

    def loft(self, rings, weights, mat, caps=(True, True)):
        """rings: list of point lists (same length); weights: list of {bone: w}; mat: slot index or f(face centre)->slot."""
        vr = [self.add(r, w) for r, w in zip(rings, weights)]; faces = []; uvl = self.uv
        for a, b in zip(vr, vr[1:]):
            n = len(a)
            for k in range(n): faces.append(self.bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])))
        if caps[0]: faces.append(self.bm.faces.new(vr[0]))
        if caps[1]: faces.append(self.bm.faces.new(vr[-1]))
        for f in faces:
            f.smooth = True; f.material_index = mat(f.calc_center_median()) if callable(mat) else mat
            for lp in f.loops: lp[uvl].uv = (-1.0, -1.0)
        return vr

    def tube(self, path, r, weights, mat, n=6):
        rings = []
        for i, p in enumerate(path):
            d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
            u = d.cross(Vector((0, 0, 1))); u = (u if u.length > 1e-3 else d.cross(Vector((1, 0, 0)))).normalized(); v = d.cross(u).normalized()
            rings.append(self.ring(p, u, v, r, r, n))
        self.loft(rings, [weights] * len(rings), mat)

    def sphere(self, centre, radii, weights, mat, u=16, v=10):
        M = Matrix.Translation(centre) @ Matrix.Diagonal((*radii, 1.0))
        vs = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=1.0, matrix=M)['verts']
        for q in vs: self.w[q] = dict(weights)
        faces = {f for q in vs for f in q.link_faces}
        for f in faces: f.smooth = True; f.material_index = mat
        return vs, faces


def torso_at(z):
    """Interpolated torso cross-section at height z -> (rx, ry, cy, weights, squareness)."""
    for a, b in zip(TORSO, TORSO[1:]):
        if a[0] <= z <= b[0]:
            k = (z - a[0]) / (b[0] - a[0]); return (a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, a[4] if k < 0.5 else b[4], a[5] + (b[5] - a[5]) * k)
    t = TORSO[0] if z < TORSO[0][0] else TORSO[-1]; return t[1], t[2], t[3], t[4], t[5]


def _build_mesh():
    S = {n: i for i, n in enumerate(SLOTS)}; B = _Builder(); X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    # ---- torso: pants below the belt, jersey over big shoulder pads, neck
    def torso_mat(c): return S['pants'] if c.z < 103.5 else S['trim'] if c.z < 105.8 else S['skin'] if c.z > 154.5 else S['trim'] if c.z > 151.5 else S['jersey']
    B.loft([B.ring(Vector((0, cy, z)), X, Y, rx, ry, 20, sq) for z, rx, ry, cy, _, sq in TORSO], [w for *_, w, _ in TORSO], torso_mat)
    for f in B.bm.faces:                                          # the number is a texture on the jersey itself: map chest and back
        front = f.calc_center_median().y < 0
        x0, x1, z0, z1 = (-11.5, 11.5, 116.5, 137.5) if front else (-13.0, 13.0, 117.5, 141.0)
        for lp in f.loops:
            co = lp.vert.co; u = (co.x - x0) / (x1 - x0); lp[B.uv].uv = (u if front else 1 - u, (co.z - z0) / (z1 - z0))
    # ---- arms (T-pose along X): sleeve over the deltoid, bare arm, glove
    for s, side in ((1, 'Left'), (-1, 'Right')):
        A, F, H = side + 'Arm', side + 'ForeArm', side + 'Hand'; sx = SHOULDER_WIDEN
        spec = [(13, 9.2, 8.8, {'Spine2': .5, A: .5}), (21 + sx, 9.4, 9.0, {A: 1}), (27 + sx, 8.6, 8.2, {A: 1}), (33 + sx, 7.9, 7.4, {A: 1}), (39 + sx, 6.6, 6.3, {A: .75, F: .25}), (43 + sx, 5.9, 5.7, {A: .5, F: .5}),
                (47 + sx, 6.5, 6.2, {F: .8, A: .2}), (55 + sx, 6.2, 5.8, {F: 1}), (64 + sx, 4.8, 4.5, {F: 1}), (70 + sx, 3.9, 3.6, {F: .6, H: .4})]
        def arm_mat(c, s=s, sx=sx): return S['jersey'] if abs(c.x) < 29 + sx else S['trim'] if abs(c.x) < 31.5 + sx else S['trim'] if 62 + sx < abs(c.x) < 66 + sx else S['skin']
        B.loft([B.ring(Vector((s * x, 5.0, 143.8)), Y, Z, ry, rz, 12) for x, ry, rz, _ in spec], [w for *_, w in spec], arm_mat, caps=(True, False))
        hand = [(70, 3.9, 3.6), (73, 5.0, 3.0), (79, 5.8, 2.8), (86, 5.5, 2.5), (91, 4.3, 2.0), (93.5, 2.4, 1.2)]
        B.loft([B.ring(Vector((s * (x + sx), 5.0, 143.8)), Y, Z, ry, rz, 12, 2.6) for x, ry, rz in hand], [{H: 1}] * len(hand), S['glove'], caps=(False, True))
        B.tube([Vector((s * (74 + sx), 0.5, 143.2)), Vector((s * (78 + sx), -3.6, 142.6)), Vector((s * (82 + sx), -5.2, 142.4))], 1.5, {H: 1}, S['glove'], 8)   # thumb
        # ---- legs: padded pants to just below the knee, sock, cleat
        U, Lg, Ft, Toe = side + 'UpLeg', side + 'Leg', side + 'Foot', side + 'ToeBase'
        leg = [(98, 9.8, 11.6, 12.2, -0.2, {'Hips': .6, U: .4}), (90, 9.8, 12.4, 13.2, -0.6, {U: 1}), (78, 9.4, 11.6, 12.6, -0.9, {U: 1}), (66, 8.9, 10.0, 10.9, -0.8, {U: 1}), (58, 8.5, 8.6, 9.3, -0.8, {U: .8, Lg: .2}),
               (52.9, 8.3, 8.1, 8.6, -0.9, {U: .5, Lg: .5}), (47, 8.2, 7.4, 7.9, -0.1, {Lg: .85, U: .15}), (38, 8.2, 7.6, 8.9, 1.5, {Lg: 1}), (27, 8.2, 6.3, 7.1, 1.6, {Lg: 1}), (16, 8.2, 5.0, 5.4, 2.0, {Lg: 1}), (10, 8.2, 4.7, 5.2, 2.3, {Lg: .5, Ft: .5})]
        def leg_mat(c): return S['pants'] if c.z > 45.5 else S['trim'] if c.z > 42.5 else S['sock'] if c.z > 26 else S['sole']
        B.loft([B.ring(Vector((s * cx, cy, z)), X, Y, rx, ry, 12) for z, cx, rx, ry, cy, _ in leg], [w for *_, w in leg], leg_mat, caps=(True, False))
        shoe = [(9.5, 4.8, 5.4, 5.8, {Ft: 1}), (4.0, 5.4, 6.3, 6.7, {Ft: 1}), (-2.5, 5.8, 5.6, 5.7, {Ft: .8, Toe: .2}), (-9, 6.1, 4.6, 4.6, {Ft: .4, Toe: .6}), (-15, 5.9, 3.7, 3.7, {Toe: 1}), (-20, 4.8, 2.8, 2.8, {Toe: 1}), (-22.5, 2.7, 1.6, 1.8, {Toe: 1})]
        B.loft([B.ring(Vector((s * 8.2, y, cz)), X, Z, rx, rz, 12, 2.5) for y, rx, rz, cz, _ in shoe], [w for *_, w in shoe], lambda c: S['sole'] if c.z < 1.6 else S['cleat'])
    # ---- head under the helmet
    hc = Vector((0, 0.6, 168.5)); B.sphere(hc, (8.6, 9.6, 11.0), {'Head': 1}, S['skin'])
    # ---- helmet shell with a face opening, centre stripe, facemask cage and a tinted visor
    hr = Vector((12.6, 14.2, 13.0)); hcen = Vector((0, 1.2, 170.2))
    vs, faces = B.sphere(hcen, tuple(hr), {'Head': 1}, S['helmet'], u=24, v=16)
    kill = []
    for f in faces:
        c = f.calc_center_median() - hcen; nx, ny, nz = c.x / hr.x, c.y / hr.y, c.z / hr.z
        if (ny < -0.42 and -0.78 < nz < 0.2 and abs(nx) < 0.72) or nz < -0.8 or (nz < -0.5 and ny < 0.1): kill.append(f)
        elif abs(nx) < 0.13 and nz > -0.35: f.material_index = S['trim']
    keep = [f for f in faces if f not in kill]; bmesh.ops.delete(B.bm, geom=kill, context='FACES')
    new = bmesh.ops.solidify(B.bm, geom=keep, thickness=1.1)['geom']
    for q in new:
        if isinstance(q, bmesh.types.BMVert): B.w[q] = {'Head': 1}
    W = {'Head': 1}; arc = lambda z, r, a0, a1, n=9: [Vector((r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), hcen.y - r * 1.08 * math.cos(math.radians(a0 + (a1 - a0) * k / n)), z)) for k in range(n + 1)]
    for z, r, a in ((166.0, 14.6, 62), (161.2, 15.0, 60), (157.0, 14.4, 55)): B.tube(arc(z, r, -a, a), 0.62, W, S['mask'])
    for a in (-24, 24): B.tube([arc(z, r, a, a, 1)[0] for z, r in ((157.0, 14.4), (161.2, 15.0), (166.0, 14.6))], 0.6, W, S['mask'])
    B.tube([arc(157.0, 14.4, 0, 0, 1)[0], arc(161.2, 15.0, 0, 0, 1)[0]], 0.6, W, S['mask'])
    for s in (-1, 1): B.tube([arc(166.0, 14.6, s * 62, s * 62, 1)[0], Vector((s * 12.0, hcen.y - 2.0, 168.5)), ], 0.62, W, S['mask']); B.tube([arc(157.0, 14.4, s * 55, s * 55, 1)[0], Vector((s * 11.0, hcen.y - 1.0, 160.0))], 0.62, W, S['mask'])
    va, vb = arc(166.2, 12.9, -56, 56, 12), arc(172.4, 12.6, -56, 56, 12)
    ra = B.add(va, W); rb = B.add(vb, W)
    for k in range(12):
        f = B.bm.faces.new((ra[k], ra[k + 1], rb[k + 1], rb[k])); f.smooth = True; f.material_index = S['visor']
    bmesh.ops.recalc_face_normals(B.bm, faces=B.bm.faces)
    return B


def build_base():
    """Import the skeleton + clips, generate the player mesh, and return {'arm','mesh','actions'} (hidden templates)."""
    path = next((os.path.join(ASSETS, 'animations', f) for f in sorted(os.listdir(os.path.join(ASSETS, 'animations'))) if f.lower().endswith(('.glb', '.gltf'))), None)
    if not path: raise FileNotFoundError('assets/animations needs a rigged .glb with idle / walk / run clips')
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]; arm = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o is not arm: bpy.data.objects.remove(o, do_unlink=True)
    arm.name = 'PlayerRig'; arm.data.name = 'PlayerRigData'
    # athletic shoulders: move both arm chains outward on the rest skeleton (rotations in the clips are unaffected)
    bpy.context.view_layer.objects.active = arm; arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    for eb in arm.data.edit_bones:
        n = eb.name.replace(PRE, '')
        for s, side in ((1, 'Left'), (-1, 'Right')):
            if n.startswith(side) and any(k in n for k in ('Arm', 'Hand')):
                eb.head.x += s * SHOULDER_WIDEN; eb.tail.x += s * SHOULDER_WIDEN
    bpy.ops.object.mode_set(mode='OBJECT')
    B = _build_mesh(); me = bpy.data.meshes.new('PlayerBody'); B.bm.verts.index_update(); weights = {v.index: w for v, w in B.w.items() if v.is_valid}
    B.bm.to_mesh(me); B.bm.free()
    ob = bpy.data.objects.new('PlayerBody', me); bpy.context.scene.collection.objects.link(ob)
    for n in SLOTS: me.materials.append(bpy.data.materials.new('slot_' + n))
    groups = {}
    for i, w in weights.items():
        tot = sum(w.values()) or 1
        for b, x in w.items():
            g = groups.get(b) or groups.setdefault(b, ob.vertex_groups.new(name=PRE + b)); g.add([i], x / tot, 'REPLACE')
    ob.parent = arm; mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    sub = ob.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    log(f'player mesh: {len(me.vertices)} verts, {len(me.polygons)} faces')
    return {'arm': arm, 'mesh': ob, 'actions': {a.name: a for a in bpy.data.actions}}


# ------------------------------------------------------------------------------------------ uniforms
def _principled(name, base, rough=0.6, metal=0.0, coat=0.0, sheen=0.0, bump=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = base; p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    for key, val in (('Coat Weight', coat), ('Sheen Weight', sheen)):
        if key in p.inputs: p.inputs[key].default_value = val
    if bump:                                                    # fine fabric / mesh texture
        tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = bump[0]; bn = nt.nodes.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = bump[1]
        nt.links.new(tex.outputs['Fac'], bn.inputs['Height']); nt.links.new(bn.outputs['Normal'], p.inputs['Normal'])
    return m


def number_image(team, num, home):
    from PIL import Image, ImageDraw
    d = os.path.join(ASSETS, 'uniforms', 'cache'); os.makedirs(d, exist_ok=True)
    fg = (team['secondary'] if luminance(team['secondary']) > 0.45 else '#ffffff') if home else team['jersey']; edge = '#0c0e12' if luminance(fg) > 0.5 else '#ffffff'
    path = os.path.join(d, f"num_{team['abbr']}_{num}_{int(home)}_{fg[1:]}.png")
    if not os.path.exists(path):
        im = Image.new('RGBA', (512, 400), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); f = font('bold', 330); s = str(num); box = dr.textbbox((0, 0), s, font=f, stroke_width=14)
        dr.text(((512 - (box[2] - box[0])) / 2 - box[0], (400 - (box[3] - box[1])) / 2 - box[1]), s, font=f, fill=fg, stroke_width=14, stroke_fill=edge); im.save(path)
    return path


_cache = {}


def team_materials(team, home):
    """All uniform materials for one team. Home wears the team colour, away wears white with coloured numbers."""
    key = (team['abbr'], team['jersey'], home)
    if key in _cache: return _cache[key]
    jersey = team['jersey'] if home else '#f4f4f4'; trim = team['secondary'] if home else team['jersey']
    pants = team['pants'] if home else (team['jersey'] if luminance(team['jersey']) < 0.6 else '#d8d8d8')
    m = {
        'jersey': _principled(f"{team['abbr']}_jersey", hex_linear(jersey), 0.72, sheen=0.35, bump=(900, 0.06)),
        'pants': _principled(f"{team['abbr']}_pants", hex_linear(pants), 0.42, sheen=0.15),
        'helmet': _principled(f"{team['abbr']}_helmet", hex_linear(team['helmet']), 0.22, metal=0.25, coat=1.0),
        'trim': _principled(f"{team['abbr']}_trim", hex_linear(trim), 0.5),
        'sock': _principled(f"{team['abbr']}_sock", hex_linear(team['socks'] if home else '#f0f0f0'), 0.8),
        'glove': _principled(f"{team['abbr']}_glove", hex_linear('#f4f4f4' if home else team['jersey']), 0.55),
        'cleat': _principled(f"{team['abbr']}_cleat", hex_linear('#16181d' if home else '#f2f2f2'), 0.3, coat=0.5),
        'sole': _principled(f"{team['abbr']}_sole", hex_linear('#f2f2f2' if home else '#16181d'), 0.5),
        'mask': _principled(f"{team['abbr']}_mask", hex_linear('#d9dde2' if luminance(team['helmet']) < 0.6 else '#30343b'), 0.3, metal=0.9),
        'visor': _principled(f"{team['abbr']}_visor", hex_linear('#05070a'), 0.04, metal=0.6, coat=1.0),
        '_jersey_hex': jersey,
    }
    _cache[key] = m; return m


def _skin(i):
    n = f'skin_{i % len(SKINS)}'
    return bpy.data.materials.get(n) or _principled(n, hex_linear(SKINS[i % len(SKINS)]), 0.55)


def _number_material(team, num, home, jersey_hex):
    n = f"num_{team['abbr']}_{num}_{int(home)}"
    if n in bpy.data.materials: return bpy.data.materials[n]
    m = _principled(n, hex_linear(jersey_hex), 0.72, sheen=0.35, bump=(900, 0.06)); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(number_image(team, num, home), check_existing=True); img.extension = 'CLIP'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = hex_linear(jersey_hex)
    nt.links.new(img.outputs['Alpha'], mix.inputs['Factor']); nt.links.new(img.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    return m


def spawn(base, coll, name, team, home, number, position='WR', index=0, attrs=None):
    """One player: own armature object (own pose), body sharing the template mesh, materials linked per object."""
    arm = bpy.data.objects.new(name, base['arm'].data); coll.objects.link(arm)
    body = bpy.data.objects.new(name + '_body', base['mesh'].data); coll.objects.link(body); body.parent = arm
    mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    sub = body.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    mats = team_materials(team, home)
    for slot, key in zip(body.material_slots, SLOTS):
        slot.link = 'OBJECT'
        slot.material = _skin(index * 5 + 3) if key == 'skin' else _number_material(team, number, home, mats['_jersey_hex']) if key in ('jersey', 'number') else mats[key]
    grp = {'LT': 'OL', 'LG': 'OL', 'C': 'OL', 'RG': 'OL', 'RT': 'OL', 'LS': 'OL', 'DE': 'DL', 'DT': 'DL', 'FS': 'S', 'SS': 'S', 'H': 'QB', 'KR': 'WR', 'PR': 'WR', 'FB': 'RB'}.get(position, position)
    h, w = BUILD.get(grp, (1.0, 1.0)); a = dict(ATTRS.get(grp, ATTRS['WR']), **(attrs or {}))
    h *= a.get('height', 1.0); w *= a.get('weight', 1.0)
    arm.scale = (0.01 * 1.04 * w, 0.01 * 1.04 * w, 0.01 * 1.04 * h)
    arm['team'] = team['abbr']; arm['jersey_number'] = int(number); arm['position'] = position
    for k in ('speed', 'acceleration', 'agility', 'strength'): arm[k] = a[k]
    arm['height_scale'] = h; arm['weight_scale'] = w
    bpy.context.view_layer.update()                            # the pose is created lazily
    if arm.pose:
        for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
    return {'arm': arm, 'body': body, 'height': 1.04 * h}
