"""Seven in Blender: skinned body, eyes, the device under the skin of his left forearm, and fur.

build(scene)  -> {'arm', 'body', 'fur', 'data', 'mats'}
pose(seven, spec) / aim()     pose bones by pointing them in world directions (no Euler guessing)
Everything is modelled in centimetres and the rig object is scaled 0.01, so the scene is in metres.
"""
import math
import bpy
import numpy as np
from mathutils import Vector, Quaternion, Matrix
import ape

SCALE = 0.01


def lin(h, a=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (a,)


# ------------------------------------------------------------------------------------------------ node helpers
class NT:
    """Tiny helper to wire shader nodes without the noise."""
    def __init__(self, nt): self.nt = nt
    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items(): setattr(n, k, v)
        return n
    def link(self, a, b): self.nt.links.new(a, b)
    def set(self, node, **inputs):
        for k, v in inputs.items():
            sock = node.inputs[k.replace('_', ' ')] if isinstance(k, str) and k.replace('_', ' ') in node.inputs else node.inputs[k]
            if hasattr(v, 'links'): self.link(v, sock)
            else: sock.default_value = v
        return node
    def attr(self, name):
        return self.node('ShaderNodeAttribute', attribute_name=name).outputs['Fac']
    def math(self, op, a, b=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None: continue
            if hasattr(v, 'links'): self.link(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs[0]
    def mix(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='RGBA')          # colour sockets: factor 0, A 6, B 7, result 2 (names repeat per data type)
        for key, v in ((0, fac), (6, a), (7, b)):
            if hasattr(v, 'links'): self.link(v, n.inputs[key])
            else: n.inputs[key].default_value = v
        return n.outputs[2]
    def ramp(self, fac, stops):
        n = self.node('ShaderNodeValToRGB'); r = n.color_ramp
        while len(r.elements) < len(stops): r.elements.new(0.5)
        for e, (pos, col) in zip(r.elements, stops): e.position = pos; e.color = col if len(col) == 4 else (*col, 1)
        self.link(fac, n.inputs['Fac']); return n.outputs['Color']
    def noise(self, scale, detail=4.0, rough=0.55, vec=None, dims='3D'):
        n = self.node('ShaderNodeTexNoise', noise_dimensions=dims); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        if vec is not None: self.link(vec, n.inputs['Vector'])
        return n.outputs['Fac']


def _material(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; return m, NT(nt), nt.nodes['Principled BSDF']


def skin_material():
    """Dark, creased ape skin: lighter and blotchy on the muzzle, leathery palms, and the device glowing through the forearm."""
    m, T, p = _material('SevenSkin'); nt = T.nt
    rest = T.node('ShaderNodeAttribute', attribute_name='rest_position'); obj = rest.outputs['Vector']      # textures stay glued to the skin when he moves
    face = T.attr('face'); palm = T.math('MAXIMUM', T.attr('palm'), T.attr('sole'))
    blotch = T.noise(0.9, 5.0, 0.6, obj); fine = T.noise(9.0, 3.0, 0.5, obj)
    muzzle = T.attr('muzzle'); warm = T.math('MULTIPLY', T.math('MULTIPLY', muzzle, 0.85), T.ramp(blotch, [(0.30, (0.25, 0.25, 0.25, 1)), (0.80, (1, 1, 1, 1))]))
    base = T.mix(warm, lin('#17110f'), lin('#3d2b23'))                                                   # near-black face, a warmer worn patch on the muzzle
    base = T.mix(T.attr('nostril'), base, lin('#020101'))
    base = T.mix(palm, base, lin('#2b2320')); base = T.mix(T.math('MULTIPLY', fine, 0.25), base, lin('#0e0b0a'))
    # creases: stretched cells for wrinkles, stronger on the face and hands
    vor = T.node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); vor.inputs['Scale'].default_value = 5.5; map_ = T.node('ShaderNodeMapping'); map_.inputs['Scale'].default_value = (1.0, 1.0, 2.6)
    T.link(obj, map_.inputs['Vector']); T.link(map_.outputs['Vector'], vor.inputs['Vector'])
    crease = T.math('SUBTRACT', 1.0, T.math('MULTIPLY', vor.outputs['Distance'], 9.0, clamp=True), clamp=True)
    amount = T.math('ADD', 0.25, T.math('MULTIPLY', T.math('MAXIMUM', face, palm), 0.75))
    height = T.math('ADD', T.math('MULTIPLY', T.math('MULTIPLY', crease, amount), -1.0), T.math('MULTIPLY', fine, 0.35))
    bump = T.node('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.55; bump.inputs['Distance'].default_value = 0.004; T.link(height, bump.inputs['Height'])
    # the device: a plate under the skin, a scar around it, cracked circuit lines that can glow
    dev = T.attr('device'); du = T.attr('dev_u'); dv = T.attr('dev_v'); comb = T.node('ShaderNodeCombineXYZ'); T.link(du, comb.inputs[0]); T.link(dv, comb.inputs[1])
    brick = T.node('ShaderNodeTexBrick'); T.link(comb.outputs[0], brick.inputs['Vector']); brick.inputs['Scale'].default_value = 3.2; brick.inputs['Mortar Size'].default_value = 0.014; brick.inputs['Color1'].default_value = (0, 0, 0, 1); brick.inputs['Color2'].default_value = (0, 0, 0, 1); brick.inputs['Mortar'].default_value = (1, 1, 1, 1)
    cells = T.node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE', distance='CHEBYCHEV'); cells.inputs['Scale'].default_value = 2.3; T.link(comb.outputs[0], cells.inputs['Vector'])
    traces = T.math('MAXIMUM', brick.outputs['Fac'], T.math('LESS_THAN', cells.outputs['Distance'], 0.018))
    crack = T.node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); crack.inputs['Scale'].default_value = 1.15; crack.inputs['Randomness'].default_value = 1.0; T.link(comb.outputs[0], crack.inputs['Vector'])
    cracks = T.math('LESS_THAN', crack.outputs['Distance'], 0.03)
    plate = T.math('GREATER_THAN', dev, 0.35); edge = T.math('MULTIPLY', T.math('GREATER_THAN', dev, 0.12), T.math('LESS_THAN', dev, 0.35))      # scar ring around the plate
    glow_mask = T.math('MULTIPLY', plate, T.math('MAXIMUM', T.math('MULTIPLY', traces, T.math('SUBTRACT', 1.0, cracks)), 0.0))
    power = T.node('ShaderNodeValue'); power.name = power.label = 'DevicePower'; power.outputs[0].default_value = 0.0
    base = T.mix(T.math('MULTIPLY', plate, 0.55), base, lin('#0b0d10')); base = T.mix(edge, base, lin('#3b2623')); base = T.mix(T.math('MULTIPLY', plate, cracks), base, lin('#020203'))
    emis = T.math('MULTIPLY', glow_mask, power.outputs[0]); under = T.math('MULTIPLY', T.math('MULTIPLY', plate, 0.012), power.outputs[0])      # faint blue under the skin when it wakes
    T.set(p, Base_Color=base, Roughness=T.math('ADD', 0.62, T.math('MULTIPLY', fine, 0.25)), Specular_IOR_Level=0.22, Subsurface_Weight=0.12, Subsurface_Scale=0.004, Normal=bump.outputs['Normal'],
          Emission_Color=lin('#1f8dff'), Emission_Strength=T.math('MULTIPLY', T.math('ADD', emis, under), 22.0))
    p.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    h2 = T.math('ADD', height, T.math('MULTIPLY', plate, 0.9)); T.link(h2, bump.inputs['Height'])        # the plate stands a little proud of the arm
    return m


def eye_material():
    m, T, p = _material('SevenEye'); iris = T.attr('iris')
    col = T.ramp(iris, [(0.0, lin('#3a2a20')), (0.72, lin('#4a3628')), (0.80, lin('#170e09')), (0.84, lin('#5c3a14')), (0.915, lin('#8a571a')), (0.94, lin('#2e1b0a')), (0.953, (0, 0, 0, 1))])
    T.set(p, Base_Color=col, Roughness=0.06, Coat_Weight=1.0, Coat_Roughness=0.02, Specular_IOR_Level=0.8)
    return m


def simple(name, colour, rough=0.4, sss=0.0):
    m, T, p = _material(name); T.set(p, Base_Color=lin(colour), Roughness=rough, Subsurface_Weight=sss); return m


def fur_material():
    """Coarse black-brown chimp hair with a dull sheen and the odd grey strand."""
    m = bpy.data.materials.new('SevenFur'); m.use_nodes = True; nt = m.node_tree; T = NT(nt)
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = T.node('ShaderNodeOutputMaterial'); hair = T.node('ShaderNodeBsdfHairPrincipled', parametrization='COLOR'); info = T.node('ShaderNodeHairInfo')
    rnd = info.outputs['Random']; grey = T.math('GREATER_THAN', rnd, 0.985)
    col = T.mix(grey, T.mix(rnd, lin('#030202'), lin('#0d0806')), lin('#55504a'))
    T.set(hair, Color=col, Roughness=0.5, Radial_Roughness=0.8, Coat=0.0, Random_Roughness=0.3); T.link(rnd, hair.inputs['Random'])
    T.link(hair.outputs['BSDF'], out.inputs['Surface'])
    return m


# ------------------------------------------------------------------------------------------------ fur
def fur_strands(b, count=190000, k=6, seed=3):
    """Hair as real strands: roots spread over the furry skin, lying along the hair-flow field, bent by gravity, gathered into
    ragged clumps. -> (points (n, k, 3) in rest space, radius (n, k), uv (n, 2))"""
    from scipy.spatial import cKDTree
    V, F, N = b['V'], b['F'], b['N']; fur = b['masks']['fur']; length = b['masks']['length']; flow = b['flow']; rng = np.random.default_rng(seed)
    tris, tuv = [], []
    for fi, f in enumerate(F):
        if b['part'][fi] != 0: continue
        uv = b['UV'][fi]
        for a in range(1, len(f) - 1): tris.append((f[0], f[a], f[a + 1])); tuv.append((uv[0], uv[a], uv[a + 1]))
    tris = np.array(tris); tuv = np.array(tuv); p0, p1, p2 = V[tris[:, 0]], V[tris[:, 1]], V[tris[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(p1 - p0, p2 - p0), axis=1); dens = fur[tris].mean(1)
    W = b['W']; bi = {n: i for i, n in enumerate(b['bones'])}; headw = W[:, bi['Head']]; close = 1 + 2.4 * headw[tris].mean(1) + 1.2 * sum(W[:, i] for n, i in bi.items() if 'Hand' in n or 'ForeArm' in n)[tris].mean(1)
    prob = area * dens * close; prob /= prob.sum(); ti = rng.choice(len(tris), size=count, p=prob)
    r1, r2 = rng.random(count), rng.random(count); s = np.sqrt(r1); bary = np.stack([1 - s, s * (1 - r2), s * r2], 1)
    interp = lambda A: (A[tris[ti]] * bary[:, :, None]).sum(1)
    keep = (fur[tris[ti]] * bary).sum(1) > rng.random(count) * 0.55; ti, bary = ti[keep], bary[keep]; n_ = len(ti)
    root = interp(V); n = interp(N); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9; fl = interp(flow); uv = (tuv[ti] * bary[:, :, None]).sum(1)
    L = (length[tris[ti]] * bary).sum(1) * rng.uniform(0.62, 1.18, n_); thick = 1 / np.sqrt(close[ti])
    ft = fl - (fl * n).sum(1, keepdims=True) * n; ft /= np.linalg.norm(ft, axis=1, keepdims=True) + 1e-9
    lift = np.clip(rng.normal(0.38, 0.12, n_), 0.12, 0.8)[:, None]; d0 = n * lift + ft * (1 - lift); d0 /= np.linalg.norm(d0, axis=1, keepdims=True)
    side = np.cross(d0, n); frizz = (side * rng.normal(0, 1, (n_, 1)) + n * rng.normal(0, 0.6, (n_, 1))) * rng.uniform(0.05, 0.3, (n_, 1))
    t = np.linspace(0, 1, k); droop = -n * 0.22 + np.array([0, 0, -0.16])
    pts = root[:, None, :] + L[:, None, None] * (t[None, :, None] * d0[:, None, :] + (t ** 2)[None, :, None] * (droop[:, None, :] + frizz[:, None, :]))
    # clumps: every strand leans toward a nearby leader, more at the tip
    lead = rng.choice(n_, size=max(1, n_ // 16), replace=False); tree = cKDTree(root[lead]); dist, j = tree.query(root); L_ = lead[j]
    c = (np.clip(rng.normal(0.74, 0.16, n_), 0.15, 0.97) * (dist < 2.2))[:, None, None] * (t ** 1.15)[None, :, None]
    target = pts[L_] + (root - root[L_])[:, None, :] * (1 - 0.86 * t)[None, :, None]; pts = pts * (1 - c) + target * c
    rad = (0.026 * thick)[:, None] * (1 - 0.85 * t ** 1.5)[None, :]
    return pts, rad, uv


def _fur_object(name, body, arm, pts, rad, uv, material):
    n, k, _ = pts.shape; cu = bpy.data.hair_curves.new(name); cu.add_curves([k] * n)
    cu.points.foreach_set('position', pts.reshape(-1).astype(np.float32)); cu.points.foreach_set('radius', rad.reshape(-1).astype(np.float32))
    at = cu.attributes.new('surface_uv_coordinate', 'FLOAT2', 'CURVE'); at.data.foreach_set('vector', uv.reshape(-1).astype(np.float32))
    cu.surface = body; cu.surface_uv_map = 'UVMap'; cu.materials.append(material)
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob); ob.parent = arm
    ng = bpy.data.node_groups.new('FurFollowsSkin', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry'); ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    i = ng.nodes.new('NodeGroupInput'); o = ng.nodes.new('NodeGroupOutput'); d = ng.nodes.new('GeometryNodeDeformCurvesOnSurface')
    ng.links.new(i.outputs[0], d.inputs[0]); ng.links.new(d.outputs[0], o.inputs[0])
    mod = ob.modifiers.new('Follow', 'NODES'); mod.node_group = ng
    return ob


# ------------------------------------------------------------------------------------------------ build
def build(fur=True, fur_count=190000, subdiv=1):
    b = ape.build(); V, F = b['V'], b['F']
    me = bpy.data.meshes.new('SevenBody'); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    for p_ in me.polygons: p_.use_smooth = True
    layer = me.uv_layers.new(name='UVMap'); layer.data.foreach_set('uv', [c for f in b['UV'] for uv in f for c in uv])
    attrs = dict(b['masks']); attrs['dev_u'] = b['dev_uv'][:, 0]; attrs['dev_v'] = b['dev_uv'][:, 1]
    for name, a in attrs.items(): me.attributes.new(name, 'FLOAT', 'POINT').data.foreach_set('value', np.asarray(a, dtype=np.float32))
    mats = dict(skin=skin_material(), eye=eye_material(), teeth=simple('SevenTeeth', '#cbbf9c', 0.3, 0.2), tongue=simple('SevenTongue', '#7a3b3b', 0.35, 0.3), fur=fur_material())
    for key in ('skin', 'eye', 'teeth', 'tongue'): me.materials.append(mats[key])
    me.polygons.foreach_set('material_index', b['part'].astype(np.int32))
    body = bpy.data.objects.new('SevenBody', me); bpy.context.scene.collection.objects.link(body); body.add_rest_position_attribute = True
    body.shape_key_add(name='Basis')
    for name, off in b['shapes'].items():
        sk = body.shape_key_add(name=name); sk.data.foreach_set('co', (V + off).reshape(-1).astype(np.float32)); sk.value = 0.0
    # skeleton straight from the joints (no third-party rig file)
    ad = bpy.data.armatures.new('SevenRig'); arm = bpy.data.objects.new('Seven', ad); bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    for n in b['bones']:
        eb = ad.edit_bones.new(n); eb.head = Vector(b['J'][n]); eb.tail = Vector(b['tails'][n])
        if (eb.tail - eb.head).length < 0.5: eb.tail = eb.head + Vector((0, 0, 2.0))
    for n in b['bones']:
        if b['parent'][n]: ad.edit_bones[n].parent = ad.edit_bones[b['parent'][n]]
    for eb in ad.edit_bones: eb.roll = 0.0
    bpy.ops.object.mode_set(mode='OBJECT')
    W = b['W']
    for i, n in enumerate(b['bones']):
        w = W[:, i]; idx = np.nonzero(w > 1e-4)[0]
        if not len(idx): continue
        g = body.vertex_groups.new(name=n)
        for wv in np.unique(np.round(w[idx], 3)): g.add([int(q) for q in idx[np.round(w[idx], 3) == wv]], float(wv), 'REPLACE')
    body.parent = arm; body.modifiers.new('Armature', 'ARMATURE').object = arm
    if subdiv:
        sub = body.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 0; sub.render_levels = subdiv
    # the device is also a real light: it throws blue onto his fur and face when it wakes
    ld = bpy.data.lights.new('DeviceGlow', 'POINT'); ld.color = (0.16, 0.50, 1.0); ld.energy = 0.0; ld.shadow_soft_size = 0.03
    glow = bpy.data.objects.new('DeviceGlow', ld); bpy.context.scene.collection.objects.link(glow); glow.parent = arm; glow.parent_type = 'BONE'; glow.parent_bone = 'LeftForeArm'
    fb = ad.bones['LeftForeArm']; c_rest = Vector(b['marks']['device']) + Vector((0, 0, 6.5))                    # just above the plate, in rest space
    glow.matrix_parent_inverse = Matrix.Identity(4); glow.location = (fb.matrix_local.inverted() @ c_rest) - Vector((0, fb.length, 0))
    arm.scale = (SCALE, SCALE, SCALE); out = dict(arm=arm, body=body, data=b, mats=mats, fur=None, glow=glow)
    if fur:
        pts, rad, uv = fur_strands(b, fur_count); out['fur'] = _fur_object('SevenFur', body, arm, pts, rad, uv, mats['fur']); out['strands'] = len(pts)
    return out


# ------------------------------------------------------------------------------------------------ posing
def aim(arm, bone, direction, twist=0.0, face=None):
    """Point a bone along a direction given in the rig's own space (+X his left, -Y forward, +Z up), then twist it about itself.
    face=(side, toward): instead of a fixed twist, roll the bone until the side of the limb that pointed along `side` in the
    T-pose (e.g. (0, 0, 1) = the top of the forearm, where the device is) points as nearly as it can toward `toward`."""
    pb = arm.pose.bones[bone]; rest = pb.bone.matrix_local.to_3x3()
    M0 = (pb.parent.matrix.to_3x3() @ pb.parent.bone.matrix_local.to_3x3().inverted() @ rest) if pb.parent else rest
    y0 = (M0 @ Vector((0, 1, 0))).normalized(); d = Vector(direction).normalized(); q = y0.rotation_difference(d)
    R = (M0.inverted() @ q.to_matrix() @ M0).to_quaternion()
    if face is not None:
        side_local = rest.inverted() @ Vector(face[0]); cur = (q.to_matrix() @ M0 @ side_local); want = Vector(face[1]).normalized()
        a = cur - d * cur.dot(d); b_ = want - d * want.dot(d)
        if a.length > 1e-4 and b_.length > 1e-4: twist += math.atan2(d.dot(a.normalized().cross(b_.normalized())), a.normalized().dot(b_.normalized()))
    pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = R @ Quaternion((0, 1, 0), twist)
    bpy.context.view_layer.update()


def _unpack(v):
    """(dir) | (dir, twist) | (dir, twist, face) -> dir, twist, face"""
    if not isinstance(v[0], (tuple, list, Vector)): return v, 0.0, None
    return v[0], (v[1] if len(v) > 1 else 0.0), (v[2] if len(v) > 2 else None)


def pose(seven, spec, order=None):
    """spec: {bone: dir | (dir, twist) | (dir, twist, (side, toward))}; 'Left*' entries are mirrored to the right unless given."""
    arm = seven['arm']; names = order or [n for n in _depth_order(arm)]; full = dict(spec); mx = lambda v: (-v[0], v[1], v[2])
    for k, v in spec.items():
        if k.startswith('Left') and 'Right' + k[4:] not in full:
            d, tw, face = _unpack(v); full['Right' + k[4:]] = (mx(d), -tw, (mx(face[0]), mx(face[1])) if face else None)
    for n in names:
        if n in full: d, tw, face = _unpack(full[n]); aim(arm, n, d, tw, face)


def look_at(seven, point):
    """Turn both eyes toward a point given in world space (metres)."""
    arm = seven['arm']; inv = arm.matrix_world.inverted()
    for n in ('LeftEye', 'RightEye'):
        pb = arm.pose.bones[n]; target = inv @ Vector(point); aim(arm, n, target - pb.head)


def _depth_order(arm):
    def depth(b): return 0 if b.parent is None else 1 + depth(b.parent)
    return [b.name for b in sorted(arm.data.bones, key=depth)]


def ground(seven, z=0.0):
    """Drop (or lift) the posed body so its lowest point rests on z."""
    dg = bpy.context.evaluated_depsgraph_get(); ev = seven['body'].evaluated_get(dg); me = ev.to_mesh(); n = len(me.vertices); co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co)
    wz = (np.array(ev.matrix_world) @ np.concatenate([co.reshape(-1, 3), np.ones((n, 1), np.float32)], 1).T)[2]; ev.to_mesh_clear()
    seven['arm'].location.z += z - float(wz.min()); bpy.context.view_layer.update(); return float(wz.min())


def device_power(seven, value, frame=None, light=15.0):
    """0 = dead, 1 = awake. Drives the glowing traces in the skin and the light they cast."""
    node = seven['mats']['skin'].node_tree.nodes['DevicePower']; node.outputs[0].default_value = value; seven['glow'].data.energy = light * value
    if frame is not None: node.outputs[0].keyframe_insert('default_value', frame=frame); seven['glow'].data.keyframe_insert('energy', frame=frame)


def face(seven, frame=None, **values):
    """Set face shapes, e.g. face(seven, Blink=1, JawOpen=0.3)."""
    kb = seven['body'].data.shape_keys.key_blocks
    for k, v in values.items():
        kb[k].value = v
        if frame is not None: kb[k].keyframe_insert('value', frame=frame)
