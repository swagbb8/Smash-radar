"""Player system: realistic football players.

Body      : CC0 MakeHuman base mesh morphed into an athletic male (three builds: skill / big / lineman), every player
            with his own face, skin tone, eyebrows and facial hair (human.py). Skin uses subsurface scattering.
Uniform   : jersey over shoulder pads, padded pants, socks and gloves are modelled on the body's own topology so they
            follow the anatomy and deform with the skeleton; helmet, facemask, chin strap and cleats are hard models.
Skeleton  : Mixamo-compatible rig + locomotion clips from assets/animations/*.glb, moved onto the body's joints.
All modelling is done in the rig's rest space: centimetres, +X = player's left, -Y = forward, +Z = up.
"""
import math, os
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
import human
from utils import ASSETS, hex_linear, hex_rgb, luminance, font, log

PRE = 'mixamorig:'
GEAR = ['helmet', 'trim', 'mask', 'visor', 'cleat', 'sole', 'strap', 'pad']
# height / build by position (multipliers on a 6'2" base)
BUILD = {'QB': (1.02, 1.0), 'RB': (0.96, 1.03), 'WR': (1.0, 0.97), 'TE': (1.04, 1.03), 'OL': (1.05, 1.08), 'DL': (1.04, 1.06), 'LB': (1.01, 1.03), 'CB': (0.98, 0.97), 'S': (0.99, 0.98), 'K': (0.95, 0.95), 'P': (0.97, 0.96)}
ATTRS = {'QB': dict(speed=72, acceleration=74, agility=76, strength=62), 'RB': dict(speed=90, acceleration=92, agility=90, strength=74), 'WR': dict(speed=94, acceleration=92, agility=92, strength=60),
         'TE': dict(speed=82, acceleration=80, agility=76, strength=80), 'OL': dict(speed=54, acceleration=60, agility=50, strength=94), 'DL': dict(speed=66, acceleration=74, agility=62, strength=92),
         'LB': dict(speed=82, acceleration=84, agility=78, strength=84), 'CB': dict(speed=93, acceleration=92, agility=93, strength=58), 'S': dict(speed=90, acceleration=89, agility=88, strength=66),
         'K': dict(speed=60, acceleration=60, agility=60, strength=50), 'P': dict(speed=62, acceleration=62, agility=60, strength=52)}
GROUP = {'LT': 'OL', 'LG': 'OL', 'C': 'OL', 'RG': 'OL', 'RT': 'OL', 'LS': 'OL', 'DE': 'DL', 'DT': 'DL', 'FS': 'S', 'SS': 'S', 'H': 'QB', 'KR': 'WR', 'PR': 'WR', 'FB': 'RB'}


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


def _build_gear(ref):
    """Helmet (shell, stripe, facemask, chin strap, optional visor) and cleats, fitted to the reference head and feet."""
    S = {n: i for i, n in enumerate(GEAR)}; B = _Builder(); X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)); W = {'Head': 1}
    lo, hi = ref.head_box; ex = (hi[0] - lo[0]) / 2; top = hi[2]
    hr = Vector((ex + 3.3, 13.2, 12.6)); hcen = Vector((0, hi[1] + 2.2 - hr.y, top + 1.9 - hr.z))
    vs, faces = B.sphere(hcen, tuple(hr), W, S['helmet'], u=72, v=48); kill = []
    for f in faces:
        c = f.calc_center_median() - hcen; nx, ny, nz = c.x / hr.x, c.y / hr.y, c.z / hr.z
        if (ny < -0.30 and -1.0 < nz < 0.30 and abs(nx) < 0.80) or nz < -0.86 or (nz < -0.55 and ny < -0.05 and abs(nx) < 0.62): kill.append(f)
        elif abs(nx) < 0.115 and (nz > 0.28 or ny > 0): f.material_index = S['trim']
    keep = [f for f in faces if f not in kill]; bmesh.ops.delete(B.bm, geom=kill, context='FACES')
    new = bmesh.ops.solidify(B.bm, geom=keep, thickness=1.5)['geom']
    for q in new:
        if isinstance(q, bmesh.types.BMVert): B.w[q] = dict(W)
    arc = lambda dz, r, a0, a1, n=12: [Vector((r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), hcen.y - r * 1.04 * math.cos(math.radians(a0 + (a1 - a0) * k / n)), hcen.z + dz)) for k in range(n + 1)]
    bars = ((-3.6, hr.y + 0.5, 58), (-7.6, hr.y + 1.3, 60), (-11.4, hr.y + 1.2, 56), (-14.2, hr.y + 0.4, 46))
    for dz, r, a in bars[1:]: B.tube(arc(dz, r, -a, a), 0.42, W, S['mask'], 8)
    for a in (-26, 26): B.tube([arc(dz, r, a, a, 1)[0] for dz, r, _ in bars], 0.40, W, S['mask'], 8)
    B.tube([arc(dz, r, 0, 0, 1)[0] for dz, r, _ in bars[1:]], 0.40, W, S['mask'], 8)
    for s in (-1, 1):
        for dz, r, a in bars[1:]: B.tube([arc(dz, r, s * a, s * a, 1)[0], Vector((s * (hr.x - 0.6), hcen.y - 2.5, hcen.z + dz * 0.72 - 0.6))], 0.42, W, S['mask'], 8)
        chin = Vector(ref.chin); cup = Vector((s * 2.6, chin.y - 0.2, chin.z + 0.6))
        B.tube([cup, Vector((s * (ex + 0.4), chin.y + 5.5, chin.z + 2.6)), Vector((s * (hr.x - 1.0), hcen.y + 0.5, hcen.z - 6.4))], 0.5, W, S['strap'], 6)
        B.tube([cup, Vector((s * (ex + 0.6), chin.y + 6.5, chin.z + 0.2)), Vector((s * (hr.x - 1.3), hcen.y + 3.0, hcen.z - 9.6))], 0.5, W, S['strap'], 6)
    chin = Vector(ref.chin); B.sphere(Vector((0, chin.y - 0.3, chin.z + 0.9)), (3.4, 1.5, 2.3), W, S['strap'], 12, 8)
    va, vb = arc(-3.2, hr.y - 0.9, -52, 52, 14), arc(2.6, hr.y - 1.2, -52, 52, 14); ra = B.add(va, W); rb = B.add(vb, W)
    for k in range(14):
        f = B.bm.faces.new((ra[k], ra[k + 1], rb[k + 1], rb[k])); f.smooth = True; f.material_index = S['visor']
    # cleats
    prof = [(0.0, 0.62, 3.4, 3.9), (0.07, 0.86, 5.6, 5.5), (0.20, 0.94, 5.5, 5.4), (0.36, 1.0, 4.9, 4.8), (0.52, 1.04, 4.0, 4.0), (0.70, 1.04, 3.2, 3.2), (0.86, 0.92, 2.6, 2.6), (0.96, 0.66, 1.9, 2.0), (1.0, 0.34, 1.0, 1.3)]
    for s, side in ((1, 'Left'), (-1, 'Right')):
        lo, hi = ref.foot_box[side]; cx = (lo[0] + hi[0]) / 2; hw = (hi[0] - lo[0]) / 2 + 0.7; y0, y1 = hi[1] + 0.9, lo[1] - 1.0; ty = ref.J[side + 'ToeBase'][1]; Ft, Toe = side + 'Foot', side + 'ToeBase'
        rings, ws = [], []
        for u, kx, rz, cz in prof:
            y = y0 + (y1 - y0) * u; k = float(human.smoothstep((ty + 2.5 - y) / 5.0)); rings.append(B.ring(Vector((cx, y, cz)), X, Z, hw * kx, rz, 14, 2.6)); ws.append({Ft: 1 - k, Toe: k} if 0 < k < 1 else ({Toe: 1} if k >= 1 else {Ft: 1}))
        B.loft(rings, ws, lambda c: S['sole'] if c.z < 1.5 else S['cleat'])
    bmesh.ops.recalc_face_normals(B.bm, faces=B.bm.faces)
    return B


def _mesh_object(name, verts, faces, weights=None, bone_names=None, uvs=None, attrs=None):
    """numpy verts + faces -> Blender mesh object with vertex groups (weights: (n, nbones) array) and float attributes."""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    if uvs is not None:
        layer = me.uv_layers.new(name='UVMap'); flat = [c for f in uvs for uv in f for c in uv]; layer.data.foreach_set('uv', flat)
    for k, a in (attrs or {}).items():
        at = me.attributes.new(k, 'FLOAT', 'POINT'); at.data.foreach_set('value', np.asarray(a, dtype=np.float32))
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if weights is not None:
        for bi, b in enumerate(bone_names):
            w = weights[:, bi]; idx = np.nonzero(w > 1e-4)[0]
            if not len(idx): continue
            g = ob.vertex_groups.new(name=b)
            for wv in np.unique(np.round(w[idx], 3)):
                sel = idx[np.round(w[idx], 3) == wv]; g.add([int(i) for i in sel], float(wv), 'REPLACE')
    return ob


def build_base():
    """Skeleton + clips, the reference body, and hidden template objects for every build. -> dict used by spawn()."""
    path = next((os.path.join(ASSETS, 'animations', f) for f in sorted(os.listdir(os.path.join(ASSETS, 'animations'))) if f.lower().endswith(('.glb', '.gltf'))), None)
    if not path: raise FileNotFoundError('assets/animations needs a rigged .glb with idle / walk / run clips')
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]; arm = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o is not arm: bpy.data.objects.remove(o, do_unlink=True)
    arm.name = 'PlayerRig'; arm.data.name = 'PlayerRigData'
    ref = human.Reference(); J = ref.J
    # move the stock skeleton onto the body's joints; bone orientations (and so the clips) are untouched
    bpy.context.view_layer.objects.active = arm; arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT'); delta = {}
    ebs = arm.data.edit_bones
    for eb in ebs: eb.use_connect = False
    def depth(b): return 0 if b.parent is None else 1 + depth(b.parent)
    for eb in sorted(ebs, key=depth):
        n = eb.name.replace(PRE, '')
        d = (Vector(J[n]) - eb.head) if n in J else delta.get(eb.parent.name if eb.parent else '', Vector((0, 0, 0)))
        delta[eb.name] = d; eb.head = eb.head + d; eb.tail = eb.tail + d
    bpy.ops.object.mode_set(mode='OBJECT')
    d = human.data(); bones = d['bones']; F = d['F']; tmpl = {}
    for bt in human.BODY_TYPES:
        V = ref.body(bt); pieces = {}
        for g in ('jersey', 'pants', 'socks', 'gloves'):
            P, faces, ids, attrs = ref.garment(g, V); uvs = None
            if g == 'jersey':
                uvs, ref.jersey_box = ref.jersey_uv(ids, faces, P); attrs['trim'] = np.maximum(human.smoothstep((ref.w_head[ids] - 0.28) / 0.05), human.smoothstep((np.abs(ref.V[ids, 0]) - (ref.sleeve - 3.0)) / 0.6))
            ob = _mesh_object(f'{bt}_{g}', P, faces, d['W'][ids], bones, uvs, attrs); _bind(ob, arm, solid=0.25 if g != 'gloves' else 0.0); pieces[g] = ob
        tmpl[bt] = pieces
    # skin template: visible body faces + eyeballs (per-player copies get their own vertex positions)
    fs = ref.skin_f + d['eye_f']; ids = np.unique(np.concatenate([F[i] for i in fs])); remap = {v: k for k, v in enumerate(ids)}
    faces = [[remap[v] for v in F[i]] for i in fs]; uvs = [[tuple(d['UV'][j]) for j in d['FUV'][i]] for i in fs]
    iris = np.zeros(len(ids))
    for side, grp in (('l', 'helper-l-eye'), ('r', 'helper-r-eye')):
        gi = d['groups'][grp]; c = ref.V[gi].mean(0); dv = ref.V[gi] - c; dv /= np.linalg.norm(dv, axis=1, keepdims=True)
        for v, val in zip(gi, -dv[:, 1]): iris[remap[v]] = val
    skin = _mesh_object('skin_template', ref.V[ids], faces, d['W'][ids], bones, uvs, {'brow': ref.brow[ids], 'beard': ref.beard[ids], 'scalp': ref.scalp[ids], 'iris': iris})
    ne = len(ref.skin_f)
    for i, p in enumerate(skin.data.polygons): p.material_index = 0 if i < ne else 1
    skin.data.materials.append(None); skin.data.materials.append(None); _bind(skin, arm)
    B = _build_gear(ref); me = bpy.data.meshes.new('PlayerGear'); B.bm.verts.index_update(); weights = {v.index: w for v, w in B.w.items() if v.is_valid}
    B.bm.to_mesh(me); B.bm.free(); gear = bpy.data.objects.new('PlayerGear', me); bpy.context.scene.collection.objects.link(gear)
    for n in GEAR: me.materials.append(None)
    groups = {}
    for i, w in weights.items():
        tot = sum(w.values()) or 1
        for b, x in w.items():
            g = groups.get(b) or groups.setdefault(b, gear.vertex_groups.new(name=PRE + b)); g.add([i], x / tot, 'REPLACE')
    _bind(gear, arm)
    hidden = [arm, skin, gear] + [o for p in tmpl.values() for o in p.values()]
    for o in hidden: o.hide_render = True; o.hide_viewport = True
    log(f'player: skin {len(skin.data.polygons)} faces, jersey {len(tmpl["big"]["jersey"].data.polygons)}, gear {len(me.polygons)}; stature {ref.stature:.1f} cm')
    return {'arm': arm, 'mesh': skin, 'gear': gear, 'tmpl': tmpl, 'ref': ref, 'skin_ids': ids, 'actions': {a.name: a for a in bpy.data.actions}}


def _bind(ob, arm, solid=0.0):
    ob.parent = arm; mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    if solid:
        so = ob.modifiers.new('Hem', 'SOLIDIFY'); so.thickness = solid; so.offset = 1.0


# ------------------------------------------------------------------------------------------ materials
def _mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; return m, nt, nt.nodes['Principled BSDF']


def _set(p, **kw):
    names = {'base': 'Base Color', 'rough': 'Roughness', 'metal': 'Metallic', 'coat': 'Coat Weight', 'coat_rough': 'Coat Roughness', 'sheen': 'Sheen Weight', 'sss': 'Subsurface Weight', 'sss_scale': 'Subsurface Scale',
             'sss_radius': 'Subsurface Radius', 'spec': 'Specular IOR Level', 'alpha': 'Alpha', 'trans': 'Transmission Weight', 'ior': 'IOR'}
    for k, v in kw.items():
        if names[k] in p.inputs: p.inputs[names[k]].default_value = v


def _attr(nt, name):
    n = nt.nodes.new('ShaderNodeAttribute'); n.attribute_name = name; return n.outputs['Fac']


def _mix(nt, fac, a, b):
    """Mix two colours (sockets or RGBA tuples) by a factor socket / float -> colour socket."""
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'
    for key, v in (('Factor', fac), ('A', a), ('B', b)):
        if hasattr(v, 'links'): nt.links.new(v, m.inputs[key])
        else: m.inputs[key].default_value = v
    return m.outputs['Result']


def _bump(nt, p, scale, strength, detail=4.0, coords='Object', second=None):
    tc = nt.nodes.new('ShaderNodeTexCoord'); tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = scale; tex.inputs['Detail'].default_value = detail
    nt.links.new(tc.outputs[coords], tex.inputs['Vector']); bn = nt.nodes.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = strength; bn.inputs['Distance'].default_value = 0.002
    nt.links.new(tex.outputs['Fac'], bn.inputs['Height'])
    if second:
        t2 = nt.nodes.new('ShaderNodeTexNoise'); t2.inputs['Scale'].default_value = second[0]; nt.links.new(tc.outputs[coords], t2.inputs['Vector'])
        b2 = nt.nodes.new('ShaderNodeBump'); b2.inputs['Strength'].default_value = second[1]; b2.inputs['Distance'].default_value = 0.01; nt.links.new(t2.outputs['Fac'], b2.inputs['Height']); nt.links.new(bn.outputs['Normal'], b2.inputs['Normal']); bn = b2
    nt.links.new(bn.outputs['Normal'], p.inputs['Normal']); return tex


def _principled(name, base, rough=0.6, metal=0.0, coat=0.0, sheen=0.0, bump=None):
    m, nt, p = _mat(name); _set(p, base=base, rough=rough, metal=metal, coat=coat, sheen=sheen)
    if bump: _bump(nt, p, bump[0], bump[1])
    return m


def skin_material(ident, key):
    """Skin with subsurface scattering, tone variation, pores, a sweat sheen, lips, eyebrows, stubble / beard and a short haircut."""
    n = f'skin_{key}'
    if n in bpy.data.materials: return bpy.data.materials[n]
    m, nt, p = _mat(n); tone = hex_linear(ident['tone']); hair = hex_linear(ident['hair'])
    tc = nt.nodes.new('ShaderNodeTexCoord'); big = nt.nodes.new('ShaderNodeTexNoise'); big.inputs['Scale'].default_value = 0.09; big.inputs['Detail'].default_value = 3.0; nt.links.new(tc.outputs['Object'], big.inputs['Vector'])
    warm = tuple(min(1.0, c * k) for c, k in zip(tone[:3], (1.18, 0.9, 0.84))) + (1.0,); col = _mix(nt, big.outputs['Fac'], tuple(c * 0.86 for c in tone[:3]) + (1.0,), warm)
    lips = nt.nodes.new('ShaderNodeTexImage'); lips.image = bpy.data.images.load(os.path.join(human.DIR, 'mpfb_lips.jpg'), check_existing=True); lips.image.colorspace_settings.name = 'Non-Color'
    lipc = tuple(min(1.0, c * k + a) for c, k, a in zip(tone[:3], (0.95, 0.55, 0.55), (0.06, 0.0, 0.0))) + (1.0,); col = _mix(nt, lips.outputs['Color'], col, lipc)
    stub = nt.nodes.new('ShaderNodeTexNoise'); stub.inputs['Scale'].default_value = 9.0; stub.inputs['Detail'].default_value = 2.0; nt.links.new(tc.outputs['Object'], stub.inputs['Vector'])
    def scaled(sock, k, noise=None):
        mth = nt.nodes.new('ShaderNodeMath'); mth.operation = 'MULTIPLY'; mth.use_clamp = True; nt.links.new(sock, mth.inputs[0]); mth.inputs[1].default_value = k
        if noise is None: return mth.outputs[0]
        m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; m2.use_clamp = True; nt.links.new(mth.outputs[0], m2.inputs[0])
        r = nt.nodes.new('ShaderNodeMapRange'); r.inputs['From Min'].default_value = 0.35; r.inputs['From Max'].default_value = 0.6; r.inputs['To Min'].default_value = 0.55; nt.links.new(noise, r.inputs['Value']); nt.links.new(r.outputs['Result'], m2.inputs[1]); return m2.outputs[0]
    hairy = tuple(c * 0.5 + h * 0.5 for c, h in zip(tone[:3], hair[:3])) + (1.0,)
    if ident['beard'] > 0: col = _mix(nt, scaled(_attr(nt, 'beard'), ident['beard'] * 0.9, stub.outputs['Fac']), col, hair if ident['beard'] > 0.8 else hairy)
    col = _mix(nt, scaled(_attr(nt, 'brow'), ident['brow'] * 1.3), col, hair); col = _mix(nt, scaled(_attr(nt, 'scalp'), 0.9, stub.outputs['Fac']), col, hair)
    nt.links.new(col, p.inputs['Base Color']); _set(p, rough=0.5, sss=0.22, sss_scale=0.006, sss_radius=(1.0, 0.36, 0.2), coat=0.03, coat_rough=0.3, spec=0.35)
    pore = _bump(nt, p, 22.0, 0.10, 6.0, second=(1.6, 0.05))
    rr = nt.nodes.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.44; rr.inputs['To Max'].default_value = 0.66; nt.links.new(pore.outputs['Fac'], rr.inputs['Value']); nt.links.new(rr.outputs['Result'], p.inputs['Roughness'])
    return m


def eye_material(ident, key):
    n = f'eye_{key}'
    if n in bpy.data.materials: return bpy.data.materials[n]
    m, nt, p = _mat(n); ramp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(_attr(nt, 'iris'), ramp.inputs['Fac']); e = ramp.color_ramp.elements; iris = hex_linear(ident['eye'])
    e[0].position = 0.80; e[0].color = (0.82, 0.80, 0.78, 1); e[1].position = 0.84; e[1].color = iris
    a = e.new(0.955); a.color = iris; b = e.new(0.975); b.color = (0.005, 0.005, 0.005, 1)
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color']); _set(p, rough=0.08, coat=1.0, coat_rough=0.03); return m


def jersey_image(team, num, home, name, box):
    """Front + back of the jersey as one 2:1 texture (planar-mapped): numbers, name bar, team word mark, shoulder seams."""
    from PIL import Image, ImageDraw
    d = os.path.join(ASSETS, 'uniforms', 'cache'); os.makedirs(d, exist_ok=True)
    body = team['jersey'] if home else '#f4f4f4'; fg = (team['secondary'] if luminance(team['secondary']) > 0.45 or luminance(body) < 0.25 else '#ffffff') if home else team['jersey']
    edge = '#0c0e12' if luminance(fg) > 0.5 else '#ffffff'; trim = team['secondary'] if home else team['jersey']
    path = os.path.join(d, f"jersey2_{team['abbr']}_{num}_{int(home)}_{body[1:]}_{fg[1:]}_{''.join(c for c in (name or '') if c.isalnum())}.png")
    if os.path.exists(path): return path
    x0, z0, z1 = box; S = 20.0; w, h = int(2 * x0 * S), int((z1 - z0) * S); top = z1 - 12.0
    def half(back):
        im = Image.new('RGB', (w, h), body); dr = ImageDraw.Draw(im); X = lambda x: (x + x0) * S; Zp = lambda z: (z1 - z) * S
        def text(s, f, cx, cz, stroke=0):
            b = dr.textbbox((0, 0), s, font=f, stroke_width=stroke); dr.text((X(cx) - (b[0] + b[2]) / 2, Zp(cz) - (b[1] + b[3]) / 2), s, font=f, fill=fg, stroke_width=stroke, stroke_fill=edge)
        if back:
            text(str(num), font('bold', 24.5 * S), 0, top - 21.5, int(0.7 * S))
            if name: nm = name.split('.')[-1].strip().upper()[:11]; text(nm, font('bold', min(6.2, 30.0 / max(1, len(nm)) * 1.75) * S), 0, top - 4.6)
        else:
            text(str(num), font('bold', 19.0 * S), 0, top - 20.5, int(0.6 * S)); text(team['name'].upper()[:10], font('bold', 4.0 * S), 0, top - 8.4)
        for s_ in (-1, 1):                                                  # stitched shoulder / side seams
            dr.line([(X(s_ * 9), Zp(top + 6)), (X(s_ * 24), Zp(top + 1))], fill=tuple(int(c * 215) for c in hex_rgb(body)), width=3)
            dr.line([(X(s_ * 15.5), Zp(top - 17)), (X(s_ * 15.0), Zp(z0))], fill=tuple(int(c * 222) for c in hex_rgb(body)), width=3)
        return im.resize((1024, 1024), Image.LANCZOS)
    out = Image.new('RGB', (2048, 1024)); out.paste(half(False), (0, 0)); out.paste(half(True), (1024, 0)); out.save(path); return path


def _fabric(nt, p, uv_scale=None):
    """Jersey mesh weave (fine) + cloth wrinkles (broad)."""
    tc = nt.nodes.new('ShaderNodeTexCoord'); vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 4.2; nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    wr = nt.nodes.new('ShaderNodeTexNoise'); wr.inputs['Scale'].default_value = 0.16; wr.inputs['Detail'].default_value = 3.0; wr.inputs['Distortion'].default_value = 0.6; nt.links.new(tc.outputs['Object'], wr.inputs['Vector'])
    b1 = nt.nodes.new('ShaderNodeBump'); b1.inputs['Strength'].default_value = 0.12; b1.inputs['Distance'].default_value = 0.001; nt.links.new(vor.outputs['Distance'], b1.inputs['Height'])
    b2 = nt.nodes.new('ShaderNodeBump'); b2.inputs['Strength'].default_value = 0.35; b2.inputs['Distance'].default_value = 0.012; nt.links.new(wr.outputs['Fac'], b2.inputs['Height']); nt.links.new(b1.outputs['Normal'], b2.inputs['Normal'])
    nt.links.new(b2.outputs['Normal'], p.inputs['Normal'])


def jersey_material(team, num, home, name, box):
    n = f"jersey_{team['abbr']}_{num}_{int(home)}"
    if n in bpy.data.materials: return bpy.data.materials[n]
    m, nt, p = _mat(n); img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(jersey_image(team, num, home, name, box), check_existing=True); img.extension = 'EXTEND'
    trim = hex_linear(team['secondary'] if home else team['jersey']); col = _mix(nt, _attr(nt, 'trim'), img.outputs['Color'], trim)
    nt.links.new(col, p.inputs['Base Color']); _set(p, rough=0.68, sheen=0.4, spec=0.3); _fabric(nt, p); return m


_cache = {}


def team_materials(team, home):
    """Shared uniform materials for one team. Home wears the team colour, away wears white with coloured numbers."""
    key = (team['abbr'], team['jersey'], home)
    if key in _cache: return _cache[key]
    A = team['abbr'] + ('H' if home else 'A'); trim = hex_linear(team['secondary'] if home else team['jersey'])
    pants = team['pants'] if home else (team['jersey'] if luminance(team['jersey']) < 0.6 else '#d8d8d8')
    pm, nt, p = _mat(A + '_pants'); col = _mix(nt, _attr(nt, 'stripe'), hex_linear(pants), trim if luminance(pants) != luminance(team['secondary']) else hex_linear('#f4f4f4')); col = _mix(nt, _attr(nt, 'belt'), col, hex_linear('#111317'))
    nt.links.new(col, p.inputs['Base Color']); _set(p, rough=0.42, sheen=0.25, spec=0.5); _bump(nt, p, 0.2, 0.25, 3.0)
    sm, nt, p = _mat(A + '_sock'); sock = hex_linear(team['socks'] if home else '#f0f0f0'); nt.links.new(_mix(nt, _attr(nt, 'band'), sock, trim if home else hex_linear(team['jersey'])), p.inputs['Base Color']); _set(p, rough=0.8, sheen=0.5); _bump(nt, p, 6.0, 0.15)
    gm, nt, p = _mat(A + '_glove'); glove = hex_linear('#f4f4f4' if home else team['jersey']); nt.links.new(_mix(nt, _attr(nt, 'cuff'), glove, hex_linear('#15171b')), p.inputs['Base Color']); _set(p, rough=0.55, spec=0.4); _bump(nt, p, 3.0, 0.2)
    hm, nt, p = _mat(A + '_helmet'); _set(p, base=hex_linear(team['helmet']), rough=0.16, metal=0.15, coat=1.0, coat_rough=0.04); _bump(nt, p, 0.5, 0.02)
    vm, nt, p = _mat(A + '_visor'); _set(p, base=(0.25, 0.28, 0.32, 1), rough=0.02, trans=1.0, ior=1.2, coat=1.0, alpha=1.0)
    m = {'pants': pm, 'socks': sm, 'gloves': gm, 'helmet': hm, 'visor': vm,
         'trim': _principled(A + '_trim', trim, 0.3, coat=0.8),
         'cleat': _principled(A + '_cleat', hex_linear('#16181d' if home else '#f2f2f2'), 0.35, coat=0.4, bump=(2.0, 0.2)),
         'sole': _principled(A + '_sole', hex_linear('#f2f2f2' if home else '#16181d'), 0.6),
         'mask': _principled(A + '_mask', hex_linear('#d9dde2' if luminance(team['helmet']) < 0.6 else '#30343b'), 0.28, metal=0.85),
         'strap': _principled(A + '_strap', hex_linear('#e9e9e6'), 0.6),
         'pad': _principled(A + '_padding', hex_linear('#1a1c20'), 0.8)}
    _cache[key] = m; return m


def _clear_visor():
    m = bpy.data.materials.get('visor_none')
    if not m:
        m, nt, p = _mat('visor_none'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); nt.links.new(tr.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def spawn(base, coll, name, team, home, number, position='WR', index=0, attrs=None, player_name=None):
    """One player: his own armature (own pose), his own face and skin, and the uniform for his build in team colours."""
    ref = base['ref']; grp = GROUP.get(position, position); bt = human.TYPE_OF.get(grp, 'skill'); ident = human.identity(index * 31 + int(number) * 7 + (0 if home else 1000))
    arm = bpy.data.objects.new(name, base['arm'].data); coll.objects.link(arm); mats = team_materials(team, home); parts = []
    def clone(tmpl, suffix, unique=False):
        ob = tmpl.copy(); ob.name = f'{name}_{suffix}'
        if unique: ob.data = tmpl.data.copy()
        coll.objects.link(ob); ob.parent = arm; ob.hide_render = False; ob.hide_viewport = False
        for md in ob.modifiers:
            if md.type == 'ARMATURE': md.object = arm
        parts.append(ob); return ob
    skin = clone(base['mesh'], 'skin', True); V = ref.body(bt, ident)[base['skin_ids']]; skin.data.vertices.foreach_set('co', V.astype(np.float32).ravel()); skin.data.update()
    skin.data.materials[0] = skin_material(ident, name); skin.data.materials[1] = eye_material(ident, name)
    for g in ('jersey', 'pants', 'socks', 'gloves'):
        ob = clone(base['tmpl'][bt][g], g); ob.data.materials.clear() if False else None
        mat = jersey_material(team, number, home, player_name, ref.jersey_box) if g == 'jersey' else mats[g]
        if not ob.material_slots: ob.data.materials.append(None)
        ob.material_slots[0].link = 'OBJECT'; ob.material_slots[0].material = mat
    gear = clone(base['gear'], 'gear'); visor = (index * 7 + int(number)) % 10 < 3 and grp in ('WR', 'CB', 'S', 'RB', 'LB')
    for slot, key in zip(gear.material_slots, GEAR):
        slot.link = 'OBJECT'; slot.material = (mats['visor'] if visor else _clear_visor()) if key == 'visor' else mats[key]
    h, w = BUILD.get(grp, (1.0, 1.0)); a = dict(ATTRS.get(grp, ATTRS['WR']), **(attrs or {})); h *= a.get('height', 1.0); w *= a.get('weight', 1.0); k = 0.01 * ref.scale
    arm.scale = (k * w, k * w, k * h)
    arm['team'] = team['abbr']; arm['jersey_number'] = int(number); arm['position'] = position
    for key in ('speed', 'acceleration', 'agility', 'strength'): arm[key] = a[key]
    arm['height_scale'] = h; arm['weight_scale'] = w
    bpy.context.view_layer.update()                            # the pose is created lazily
    if arm.pose:
        for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
    return {'arm': arm, 'body': skin, 'parts': parts, 'height': ref.stature * ref.scale * h / 100}
