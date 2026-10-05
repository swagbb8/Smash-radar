"""The swamp where Seven wakes (Episode 1, "ARISE").

Ash's words: "the grass met up to my eye view ... cold mud up to my knees ... the trees were rows and rows leading to
darkness of more rows of trees with vines hanging down connected together to one another ... the sun trying to climb
through the leaves of the trees but just barely brings a dim light down below reflecting off the water of the swamp ...
there was a branch close enough to me."

World units are metres, Z is up, the water lies at z = 0, Seven wakes at the origin on the edge of a mud bank.
Trees stand in loose rows running away along +Y. Plants, bark, mud and sky are CC0 scans from Poly Haven (assets.py);
trunks, vines, grass and water are built here.

    build(sc, seed)  ->  dict of handles
    python swamp.py out.png [--cam wide|low|up|bank] [--size 960x402] [--samples 48] [--fog 1]
"""
import math, os, sys, time
import bpy
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import basemesh as bm
from basemesh import smoothstep
import assets
from seven import NT, lin

WATER = 0.0


# ------------------------------------------------------------------------------------------------ layout
def layout(seed=4):
    """Where everything stands. Trees in rows 6 m apart, each row shifted against the last, a clearing round the origin."""
    rng = np.random.default_rng(seed); trees = []
    for iy, gy in enumerate(np.arange(-66.0, 96.0, 6.5)):
        for gx in np.arange(-78.0, 79.0, 6.0):
            x = gx + (3.0 if iy % 2 else 0.0) + rng.uniform(-1.3, 1.3); y = gy + rng.uniform(-1.3, 1.3)
            if math.hypot(x, y - 0.5) < 4.4: continue
            trees.append(dict(x=float(x), y=float(y), r=float(rng.uniform(0.30, 0.62) * (1.45 if rng.random() < 0.14 else 1.0)), kind=int(rng.integers(0, 6)), rot=float(rng.uniform(0, 2 * math.pi)), s=float(rng.uniform(0.88, 1.18))))
    big = [(-6.6, 5.2, 1.9, 0.6), (7.4, 7.9, 2.1, 2.5), (-9.5, -6.0, 1.7, 4.0), (9.8, -3.2, 1.8, 1.2)]            # whole spreading trees round the clearing: x, y, scale, turn
    trees = [t for t in trees if all(math.hypot(t['x'] - b[0], t['y'] - b[1]) > 3.4 for b in big)]
    # the branch: a dead limb fallen across the corner of the pool, low enough to jump for
    return dict(seed=seed, trees=trees, bank=(0.5, 1.3), big=big, branch=dict(a=(-4.6, 3.6, 1.80), b=(2.9, 2.1, 1.67), thick=0.22), bed=0.16)


def ground_z(x, y, L):
    """Height of the mud at (x, y): a shallow, lumpy bottom mostly just under the water, mounds at the foot of every tree, the bank he wakes on."""
    x = np.asarray(x, float); y = np.asarray(y, float); P = np.stack([x.ravel(), y.ravel(), np.zeros(x.size)], 1)
    n1 = bm.noise3(P, 12.0, 31).reshape(x.shape); n2 = bm.noise3(P, 2.4, 32).reshape(x.shape); n3 = bm.noise3(P, 0.45, 33, octaves=2).reshape(x.shape)
    z = -0.30 + 0.50 * (n1 - 0.5) + 0.13 * (n2 - 0.5) + 0.035 * (n3 - 0.5)
    for t in L['trees']:
        d2 = (x - t['x']) ** 2 + (y - t['y']) ** 2; near = d2 < 49.0
        if near.any(): z = z + np.where(near, 0.46 * np.exp(-d2 / (2.4 * t['r'] + 0.7) ** 2), 0.0)
    bx, by = L['bank']; d = np.sqrt((x - bx) ** 2 + (y - (by - 0.6)) ** 2); z = z + 0.47 * np.exp(-(d / 2.1) ** 2)
    px, py, pr, pd = L.get('pool', (0.0, 3.7, 1.7, 0.95)); z = z - pd * np.exp(-(((x - px) ** 2 + (y - py) ** 2) / pr ** 2))                 # the deep hole under the branch
    flat = smoothstep((1.9 - d) / 0.8); z = z * (1 - flat) + (L.get('bed', 0.16) + 0.03 * (n3 - 0.5) + 0.02 * (n2 - 0.5)) * flat      # the bed he lies on: level, a little above the water
    return z


# ------------------------------------------------------------------------------------------------ materials
def _pbr(T, asset, size, vec, blend=0.3):
    """Image nodes of a Poly Haven texture set, box-projected at `size` metres per repeat. -> (colour, roughness, normal)"""
    im = assets.images(asset); mp = T.node('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / size,) * 3; T.link(vec, mp.inputs['Vector']); out = {}
    for k in ('diff', 'rough', 'nor'):
        if k not in im: continue
        n = T.node('ShaderNodeTexImage', projection='BOX'); n.projection_blend = blend; n.image = bpy.data.images.load(im[k], check_existing=True)
        if k != 'diff': n.image.colorspace_settings.name = 'Non-Color'
        T.link(mp.outputs['Vector'], n.inputs['Vector']); out[k] = n.outputs['Color']
    nm = T.node('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0; T.link(out['nor'], nm.inputs['Color'])
    return out['diff'], out.get('rough'), nm.outputs['Normal']


def zone_field():
    """In a character pass only the scenery close to Seven is rendered; further out the camera sees a hole, through which
    the plate shows. This node group says how much to render at a point (1 near him .. 0 far). ZX, ZY = centre,
    R0 = fully rendered inside, R1 = held out beyond. Defaults render everything (that is what a plate wants).
    Only rays straight from the camera find the hole: in reflections, shadows and bounced light the swamp is all there."""
    g = bpy.data.node_groups.get('SwampZone')
    if g: return g
    g = bpy.data.node_groups.new('SwampZone', 'ShaderNodeTree'); g.interface.new_socket('Show', in_out='OUTPUT', socket_type='NodeSocketFloat'); T = NT(g); go = T.node('NodeGroupOutput')
    vals = {}
    for name, v in (('ZX', 0.0), ('ZY', 0.0), ('R0', 1e6), ('R1', 2e6)):
        n = T.node('ShaderNodeValue'); n.name = n.label = name; n.outputs[0].default_value = v; vals[name] = n.outputs[0]
    pos = T.node('ShaderNodeSeparateXYZ'); T.link(T.node('ShaderNodeNewGeometry').outputs['Position'], pos.inputs[0])
    dx = T.math('SUBTRACT', pos.outputs['X'], vals['ZX']); dy = T.math('SUBTRACT', pos.outputs['Y'], vals['ZY']); d = T.math('SQRT', T.math('ADD', T.math('MULTIPLY', dx, dx), T.math('MULTIPLY', dy, dy)))
    m_ = T.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); T.link(d, m_.inputs['Value']); T.link(vals['R1'], m_.inputs['From Min']); T.link(vals['R0'], m_.inputs['From Max'])
    cam = T.node('ShaderNodeLightPath').outputs['Is Camera Ray']
    T.link(T.math('MAXIMUM', m_.outputs['Result'], T.math('SUBTRACT', 1.0, cam)), go.inputs['Show'])
    return g


def set_zone(center=None, r0=2.4, r1=3.4):
    """center=None: render everything (plates). Otherwise the (x, y) the character pass is built around."""
    g = zone_field(); v = lambda n: g.nodes[n].outputs[0]
    if center is None: v('R0').default_value = 1e6; v('R1').default_value = 2e6
    else: v('ZX').default_value = center[0]; v('ZY').default_value = center[1]; v('R0').default_value = r0; v('R1').default_value = r1


def _zoned(m):
    """Wrap a material's surface so the camera sees a hole wherever the zone says so. Leaves cut out with an alpha
    texture stay cut out (otherwise the whole card would punch a square hole in whatever is behind it)."""
    if not m.use_nodes or m.get('zoned'): return m
    nt = m.node_tree; outs = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial' and n.inputs['Surface'].is_linked]
    if not outs: return m
    out = ([n for n in outs if n.is_active_output] or outs)[0]; src = out.inputs['Surface'].links[0].from_socket; alpha = None
    if src.node.bl_idname == 'ShaderNodeBsdfPrincipled' and src.node.inputs['Alpha'].is_linked:
        l = src.node.inputs['Alpha'].links[0]; alpha = l.from_socket; nt.links.remove(l); src.node.inputs['Alpha'].default_value = 1.0
    grp = nt.nodes.new('ShaderNodeGroup'); grp.node_tree = zone_field(); hold = nt.nodes.new('ShaderNodeHoldout'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(grp.outputs['Show'], mx.inputs[0]); nt.links.new(hold.outputs[0], mx.inputs[1]); nt.links.new(src, mx.inputs[2]); res = mx.outputs[0]
    if alpha is not None:
        clear = nt.nodes.new('ShaderNodeBsdfTransparent'); cut = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(alpha, cut.inputs[0]); nt.links.new(clear.outputs[0], cut.inputs[1]); nt.links.new(res, cut.inputs[2]); res = cut.outputs[0]
    nt.links.new(res, out.inputs['Surface']); m['zoned'] = 1; return m


def zone_all(skip=('LeafScreen', 'SwampAir')):
    """Every scenery material gets the zone switch. Call once the swamp is built and before Seven is."""
    n = 0
    for m in bpy.data.materials:
        if m.name not in skip and m.use_nodes and not m.get('zoned'): _zoned(m); n += 1
    return n


def ripple_field():
    """Rings spreading over the water from where something fell in. Inside: RX, RY = where, RT = seconds since (negative =
    nothing), RA = how hard. Out: a height to add to the water's bump."""
    g = bpy.data.node_groups.get('SwampRipple')
    if g: return g
    g = bpy.data.node_groups.new('SwampRipple', 'ShaderNodeTree'); g.interface.new_socket('Height', in_out='OUTPUT', socket_type='NodeSocketFloat'); T = NT(g); go = T.node('NodeGroupOutput'); vals = {}
    for name, v in (('RX', 0.0), ('RY', 0.0), ('RT', -1.0), ('RA', 0.0)):
        n = T.node('ShaderNodeValue'); n.name = n.label = name; n.outputs[0].default_value = v; vals[name] = n.outputs[0]
    pos = T.node('ShaderNodeSeparateXYZ'); T.link(T.node('ShaderNodeNewGeometry').outputs['Position'], pos.inputs[0])
    dx = T.math('SUBTRACT', pos.outputs['X'], vals['RX']); dy = T.math('SUBTRACT', pos.outputs['Y'], vals['RY']); r = T.math('SQRT', T.math('ADD', T.math('MULTIPLY', dx, dx), T.math('MULTIPLY', dy, dy)))
    t = T.math('MAXIMUM', vals['RT'], 0.0); total = None
    for speed, width, freq, amp in ((0.85, 0.42, 17.0, 1.0), (0.48, 0.30, 26.0, 0.6), (0.22, 0.22, 34.0, 0.35)):                 # three trains of rings, the fast wide one in front
        u = T.math('SUBTRACT', r, T.math('ADD', T.math('MULTIPLY', t, speed), 0.12)); env = T.math('EXPONENT', T.math('MULTIPLY', T.math('MULTIPLY', T.math('DIVIDE', u, width), T.math('DIVIDE', u, width)), -1.0))
        w = T.math('MULTIPLY', T.math('MULTIPLY', env, T.math('SINE', T.math('MULTIPLY', u, freq))), amp); total = w if total is None else T.math('ADD', total, w)
    fade = T.math('MULTIPLY', T.math('MULTIPLY', vals['RA'], T.math('EXPONENT', T.math('MULTIPLY', t, -0.75))), T.math('GREATER_THAN', vals['RT'], 0.0))
    T.link(T.math('MULTIPLY', total, fade), go.inputs['Height']); return g


def set_ripple(xy=None, t=-1.0, amp=1.0):
    g = ripple_field(); v = lambda n: g.nodes[n].outputs[0]
    if xy is None: v('RT').default_value = -1.0; v('RA').default_value = 0.0
    else: v('RX').default_value = xy[0]; v('RY').default_value = xy[1]; v('RT').default_value = t; v('RA').default_value = amp


def mud_material():
    """Swamp floor: two scanned muds mixed in patches, soaked dark and shiny at the waterline, slimed green under it."""
    m = bpy.data.materials.new('SwampMud'); m.use_nodes = True; T = NT(m.node_tree); p = T.nt.nodes['Principled BSDF']
    pos = T.node('ShaderNodeNewGeometry').outputs['Position']; z = T.node('ShaderNodeSeparateXYZ'); T.link(pos, z.inputs[0])
    c1, r1, n1 = _pbr(T, 'mud_forest', 2.4, pos); c2, r2, n2 = _pbr(T, 'brown_mud_leaves_01', 1.6, pos)
    patch = T.ramp(T.noise(0.22, 3.0, 0.6, pos), [(0.42, (0, 0, 0, 1)), (0.60, (1, 1, 1, 1))])
    col = T.mix(patch, c1, c2); rough = T.mix(patch, r1, r2); nrm = T.node('ShaderNodeMix', data_type='VECTOR'); T.link(patch, nrm.inputs[0]); T.link(n1, nrm.inputs[4]); T.link(n2, nrm.inputs[5])
    wet = T.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); T.link(z.outputs['Z'], wet.inputs['Value']); wet.inputs['From Min'].default_value = 0.22; wet.inputs['From Max'].default_value = 0.02; wet = wet.outputs['Result']
    under = T.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); T.link(z.outputs['Z'], under.inputs['Value']); under.inputs['From Min'].default_value = 0.0; under.inputs['From Max'].default_value = -0.25; under = under.outputs['Result']
    dark = T.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); dark.inputs[0].default_value = 1.0; T.link(col, dark.inputs[6]); T.link(T.mix(wet, (1, 1, 1, 1), (0.34, 0.30, 0.26, 1)), dark.inputs[7])
    col = T.mix(T.math('MULTIPLY', under, 0.55), dark.outputs[2], lin('#141a0e'))
    T.set(p, Base_Color=col, Roughness=T.mix(wet, rough, (0.16, 0.16, 0.16, 1)), Specular_IOR_Level=0.5); T.link(nrm.outputs[1], p.inputs['Normal'])
    return m


def water_material():
    """Black swamp water: mirror-still, clear only where it is a hand deep; scum and fallen leaves drifting on it."""
    m = bpy.data.materials.new('SwampWater'); m.use_nodes = True; nt = m.node_tree; T = NT(nt)
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = T.node('ShaderNodeOutputMaterial'); pos = T.node('ShaderNodeNewGeometry').outputs['Position']
    rip = T.node('ShaderNodeBump'); rip.inputs['Strength'].default_value = 0.10; rip.inputs['Distance'].default_value = 0.02
    w1 = T.noise(1.6, 2.0, 0.5, pos); w2 = T.noise(9.0, 2.0, 0.5, pos); T.link(T.math('ADD', w1, T.math('MULTIPLY', w2, 0.25)), rip.inputs['Height'])
    rg = T.node('ShaderNodeGroup'); rg.node_tree = ripple_field(); rings = T.node('ShaderNodeBump'); rings.inputs['Strength'].default_value = 0.85; rings.inputs['Distance'].default_value = 0.035
    T.link(rg.outputs['Height'], rings.inputs['Height']); T.link(rip.outputs['Normal'], rings.inputs['Normal']); rip = rings                       # rings from a splash ride on top of the still water's own slight movement
    gloss = T.node('ShaderNodeBsdfGlossy'); gloss.inputs['Roughness'].default_value = 0.015; gloss.inputs['Color'].default_value = (0.9, 0.92, 0.9, 1); T.link(rip.outputs['Normal'], gloss.inputs['Normal'])
    clear = T.node('ShaderNodeBsdfTransparent'); clear.inputs['Color'].default_value = (0.80, 0.86, 0.72, 1)
    fr = T.node('ShaderNodeFresnel'); fr.inputs['IOR'].default_value = 1.33; T.link(rip.outputs['Normal'], fr.inputs['Normal'])
    surf = T.node('ShaderNodeMixShader'); T.link(T.math('ADD', T.math('MULTIPLY', fr.outputs[0], 0.95), 0.03, clamp=True), surf.inputs[0]); T.link(clear.outputs[0], surf.inputs[1]); T.link(gloss.outputs[0], surf.inputs[2])
    # scum: little green flecks gathered in drifts
    vor = T.node('ShaderNodeTexVoronoi', feature='F1'); vor.inputs['Scale'].default_value = 55.0; T.link(pos, vor.inputs['Vector'])
    drift = T.ramp(T.noise(0.35, 4.0, 0.65, pos), [(0.50, (0, 0, 0, 1)), (0.68, (1, 1, 1, 1))])
    fleck = T.math('MULTIPLY', T.math('LESS_THAN', vor.outputs['Distance'], 0.36), drift)
    weed = T.node('ShaderNodeBsdfPrincipled'); T.set(weed, Base_Color=T.mix(vor.outputs['Color'], lin('#3d4a1c'), lin('#6b7a2a')), Roughness=0.55)
    top = T.node('ShaderNodeMixShader'); T.link(fleck, top.inputs[0]); T.link(surf.outputs[0], top.inputs[1]); T.link(weed.outputs[0], top.inputs[2])
    absorb = T.node('ShaderNodeVolumeAbsorption'); absorb.inputs['Color'].default_value = (0.30, 0.24, 0.10, 1); absorb.inputs['Density'].default_value = 11.0
    T.link(top.outputs[0], out.inputs['Surface']); T.link(absorb.outputs[0], out.inputs['Volume'])
    return m


def bark_material(asset, size, moss=0.5):
    """Trunk bark from a scan, moss climbing from the roots and on one side, dark and wet at the waterline."""
    m = bpy.data.materials.new('Bark_' + asset); m.use_nodes = True; T = NT(m.node_tree); p = T.nt.nodes['Principled BSDF']
    obj = T.node('ShaderNodeTexCoord').outputs['Object']; pos = T.node('ShaderNodeNewGeometry').outputs['Position']; z = T.node('ShaderNodeSeparateXYZ'); T.link(pos, z.inputs[0])
    col, rough, nrm = _pbr(T, asset, size, obj)
    low = T.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); T.link(z.outputs['Z'], low.inputs['Value']); low.inputs['From Min'].default_value = 5.5; low.inputs['From Max'].default_value = 0.2
    mossy = T.math('MULTIPLY', T.ramp(T.math('ADD', T.noise(0.9, 4.0, 0.65, pos), T.math('MULTIPLY', low.outputs['Result'], 0.45)), [(0.55, (0, 0, 0, 1)), (0.80, (1, 1, 1, 1))]), moss)
    col = T.mix(mossy, col, T.mix(T.noise(7.0, 2.0, 0.5, pos), lin('#1f2a0c'), lin('#4a5a1a')))
    wet = T.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); T.link(z.outputs['Z'], wet.inputs['Value']); wet.inputs['From Min'].default_value = 0.55; wet.inputs['From Max'].default_value = 0.05
    dark = T.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); dark.inputs[0].default_value = 1.0; T.link(col, dark.inputs[6]); T.link(T.mix(wet.outputs['Result'], (0.62, 0.62, 0.62, 1), (0.22, 0.20, 0.17, 1)), dark.inputs[7])
    T.set(p, Base_Color=dark.outputs[2], Roughness=T.mix(wet.outputs['Result'], T.mix(mossy, rough, (0.9, 0.9, 0.9, 1)), (0.22, 0.22, 0.22, 1))); T.link(nrm, p.inputs['Normal'])
    return m


# ------------------------------------------------------------------------------------------------ geometry
def _grid(x0, x1, y0, y1, step):
    xs = np.arange(x0, x1 + step * 0.5, step); ys = np.arange(y0, y1 + step * 0.5, step); X, Y = np.meshgrid(xs, ys, indexing='ij'); nx, ny = X.shape
    i = np.arange(nx * ny).reshape(nx, ny); F = np.stack([i[:-1, :-1], i[1:, :-1], i[1:, 1:], i[:-1, 1:]], -1).reshape(-1, 4)
    return X, Y, F


def _mesh(name, V, F, material=None, smooth=True, coll=None):
    me = bpy.data.meshes.new(name); me.from_pydata(np.asarray(V, float).reshape(-1, 3).tolist(), [], np.asarray(F).tolist()); me.update()
    if smooth:
        for p_ in me.polygons: p_.use_smooth = True
    if material: me.materials.append(material)
    ob = bpy.data.objects.new(name, me); (coll or bpy.context.scene.collection).objects.link(ob); return ob


def terrain(L):
    """A fine patch of ground where the camera works, inside a coarse one that runs off into the trees."""
    mat = mud_material(); obs = []
    for name, (x0, x1, y0, y1, step), drop in (('GroundNear', (-9, 9, -7, 13, 0.05), 0.0), ('GroundFar', (-96, 96, -84, 112, 0.7), 0.0)):
        X, Y, F = _grid(x0, x1, y0, y1, step); Z = ground_z(X, Y, L)
        if name == 'GroundFar': Z = Z - 0.06 * smoothstep((9.5 - np.abs(X)) / 0.5) * smoothstep((7.5 - np.abs(Y - 3.0)) / 0.5 + 5.0) * ((np.abs(X) < 9.6) & (Y > -7.6) & (Y < 13.6))      # tuck under the fine patch
        obs.append(_mesh(name, np.stack([X, Y, Z], -1), F, mat))
    return obs


def water():
    V = [(-100, -88, WATER), (100, -88, WATER), (100, 116, WATER), (-100, 116, WATER), (-100, -88, -2.2), (100, -88, -2.2), (100, 116, -2.2), (-100, 116, -2.2)]
    F = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return _mesh('Water', V, F, water_material(), smooth=False)


def _trunk(seed, height=30.0, nth=72):
    """One swamp tree as a unit trunk (radius 1 at chest height; scale it per tree): flared, buttressed foot, lumpy bark, a slight lean."""
    rng = np.random.default_rng(seed); zs = np.concatenate([np.linspace(-0.9, 3.0, 30), np.linspace(3.3, 9.0, 12), np.linspace(10.0, height, 10)]); th = np.linspace(0, 2 * np.pi, nth, endpoint=False)
    nb = int(rng.integers(4, 8)); ang = np.linspace(0, 2 * np.pi, nb, endpoint=False) + rng.uniform(-0.35, 0.35, nb) + rng.uniform(0, 6.28); amp = rng.uniform(0.5, 1.6, nb); tall = rng.uniform(0.55, 1.7, nb); sharp = rng.uniform(7, 26, nb); wav = rng.uniform(0, 6.28, nb)
    lean = rng.normal(0, 0.012, 2); sway = rng.uniform(0, 6.28, 2); V = []
    for z in zs:
        r = (1 - 0.42 * max(z, 0) / height) + 0.30 * math.exp(-max(z + 0.3, 0) / 0.55)
        fin = sum(a * math.exp(-(max(z, 0.0) / t_) ** 1.6) * np.maximum(0, np.cos(th - an - 0.16 * math.sin(z * 1.9 + w_))) ** s_ for a, t_, s_, an, w_ in zip(amp, tall, sharp, ang, wav))      # root flanges: they wander as they climb
        lump = 0.07 * (bm.noise3(np.stack([np.cos(th) * 1.3, np.sin(th) * 1.3, np.full(nth, z * 0.5)], 1), 0.9, seed) - 0.5) * 2
        rr = r * (1 + fin) * (1 + lump); cx = lean[0] * z * z * 0.2 + 0.05 * math.sin(z * 0.25 + sway[0]) * min(z, 6) / 6 * (z > 0); cy = lean[1] * z * z * 0.2 + 0.05 * math.sin(z * 0.21 + sway[1]) * min(z, 6) / 6 * (z > 0)
        V.append(np.stack([cx + rr * np.cos(th), cy + rr * np.sin(th), np.full(nth, z)], 1))
    V = np.concatenate(V); nz = len(zs); i = np.arange(nz * nth).reshape(nz, nth); j = np.roll(i, -1, axis=1)
    F = np.stack([i[:-1], j[:-1], j[1:], i[1:]], -1).reshape(-1, 4)
    return V, F


def trees(L, coll):
    """Six trunk shapes, three barks; every tree in the layout is one of them turned and scaled (cheap to render however many there are)."""
    barks = [bark_material('bark_brown_02', 1.6, 0.7), bark_material('jolcham_oak_bark_01', 2.2, 0.55), bark_material('japanese_hackberry_bark', 2.0, 0.8)]; kinds = []
    for k in range(6):
        V, F = _trunk(100 + k); me = bpy.data.meshes.new(f'Trunk{k}'); me.from_pydata(V.tolist(), [], F.tolist()); me.update(); me.materials.append(barks[k % 3])
        for p_ in me.polygons: p_.use_smooth = True
        kinds.append(me)
    out = []
    for i, t in enumerate(L['trees']):
        ob = bpy.data.objects.new(f'Tree{i:03d}', kinds[t['kind']]); coll.objects.link(ob); ob.location = (t['x'], t['y'], 0.0); ob.rotation_euler = (0, 0, t['rot']); ob.scale = (t['r'], t['r'], t['s']); out.append(ob)
    return out


def _instance(coll_src, name, loc, rot_z, scale, coll, tilt=(0.0, 0.0)):
    e = bpy.data.objects.new(name, None); e.instance_type = 'COLLECTION'; e.instance_collection = coll_src; e.location = loc; e.rotation_euler = (tilt[0], tilt[1], rot_z); e.scale = (scale,) * 3 if np.isscalar(scale) else scale
    e.empty_display_size = 0.2; coll.objects.link(e); return e


def jacaranda():
    """The scanned jacaranda (Poly Haven): -> (whole tree, crown only) as collections to instance. Trunk foot at the origin, about 19 m tall."""
    with bpy.data.libraries.load(assets.path('jacaranda_tree'), link=False) as (src, dst): dst.collections = ['jacaranda_tree_geometry_nodes', 'jacaranda_tree_leaves_LOD1', 'jacaranda_tree_leaves_LOD0', 'jacaranda_tree_trunk_LOD1']
    crown = bpy.data.objects['jacaranda_tree_geometry_nodes']; trunk = bpy.data.objects['jacaranda_tree_trunk_LOD1']; crown.location = (0, 0, 0); trunk.location = (0, 0, 0)
    full = bpy.data.collections.new('JacarandaTree'); full.objects.link(crown); full.objects.link(trunk); top = bpy.data.collections.new('JacarandaCrown'); top.objects.link(crown)
    return full, top


def canopy(L, coll, rng):
    """Leaves overhead, only where the camera can tell: a jacaranda crown high on the trunks round the clearing and four whole
    spreading trees beside it. They are seen and reflected but cast no shadows: the lamps are shaped by leaf-cut screens
    instead (see sky), which is what makes the dapples and the shafts, and is far quicker to render."""
    full, top = jacaranda(); out = []
    for i, t in enumerate(L['trees']):
        d = math.hypot(t['x'], t['y'])
        if d < 26 and rng.random() < 0.75: s_ = rng.uniform(1.05, 1.7); out.append(_instance(top, f'Crown{i:03d}', (t['x'], t['y'], rng.uniform(9.0, 16.0) - 2.6 * s_), rng.uniform(0, 6.28), s_, coll, tilt=(rng.normal(0, 0.08), rng.normal(0, 0.08))))
    for k, (x, y, s_, r_) in enumerate(L['big']): out.append(_instance(full, f'BigTree{k}', (x, y, float(ground_z(x, y, L)) - 0.25), r_, s_, coll))
    for e in out: e.visible_shadow = False
    return out


def vines(L, coll, rng):
    """Lianas strung from tree to tree and hanging down from them: "vines hanging down connected together to one another"."""
    T_ = L['trees']; xy = np.array([[t['x'], t['y']] for t in T_]); splines = []
    def add(pts, r): splines.append((np.asarray(pts, float), r))
    for i, t in enumerate(T_):
        d = np.hypot(xy[:, 0] - t['x'], xy[:, 1] - t['y']); near = [j for j in np.argsort(d)[1:5] if j > i and d[j] < 11.5]
        for j in near:
            if rng.random() > 0.62: continue
            for _ in range(int(rng.integers(1, 3))):
                a = np.array([t['x'], t['y'], rng.uniform(4.0, 17.0)]); b = np.array([xy[j, 0], xy[j, 1], rng.uniform(4.0, 17.0)]); n = 22; u = np.linspace(0, 1, n); sag = rng.uniform(0.12, 0.34) * d[j]
                side = np.cross(b - a, [0, 0, 1.0]); side /= np.linalg.norm(side) + 1e-9
                pts = a[None] * (1 - u)[:, None] + b[None] * u[:, None]; pts[:, 2] -= sag * 4 * u * (1 - u); pts += side[None] * (rng.uniform(-0.6, 0.6) * np.sin(np.pi * u))[:, None]
                pts += np.cumsum(rng.normal(0, 0.03, (n, 3)), 0) * np.sin(np.pi * u)[:, None]; add(pts, rng.uniform(0.018, 0.045))
                for _ in range(int(rng.integers(0, 5))):                                   # hangers dropping off it
                    k = int(rng.integers(3, n - 3)); top_ = pts[k]; floor = max(-0.2, float(ground_z(top_[0], top_[1], L)) - 0.1); bottom = max(floor, top_[2] - rng.uniform(2.0, 14.0)); m_ = 14; v = np.linspace(0, 1, m_)
                    h = top_[None] * np.ones((m_, 1)); h[:, 2] = top_[2] + (bottom - top_[2]) * v; h[:, :2] += np.cumsum(rng.normal(0, 0.035, (m_, 2)), 0) + (rng.normal(0, 0.12, 2)[None] * np.sin(np.pi * v * rng.uniform(0.5, 1.5))[:, None]); add(h, rng.uniform(0.008, 0.02))
    for t in T_:                                                                            # and straight down out of the roof
        for _ in range(int(rng.integers(0, 3))):
            ang = rng.uniform(0, 6.28); rr = rng.uniform(0.8, 3.4); x, y = t['x'] + rr * math.cos(ang), t['y'] + rr * math.sin(ang); top_z = rng.uniform(9.0, 20.0); bottom = max(float(ground_z(x, y, L)) - 0.1, top_z - rng.uniform(4.0, 19.0)); m_ = 16; v = np.linspace(0, 1, m_)
            h = np.stack([np.full(m_, x), np.full(m_, y), top_z + (bottom - top_z) * v], 1); h[:, :2] += np.cumsum(rng.normal(0, 0.04, (m_, 2)), 0); add(h, rng.uniform(0.008, 0.024))
    cu = bpy.data.curves.new('Vines', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = 1; cu.resolution_u = 3
    for pts, r in splines:
        sp = cu.splines.new('NURBS'); sp.points.add(len(pts) - 1); sp.use_endpoint_u = True; sp.order_u = 3
        sp.points.foreach_set('co', np.concatenate([pts, np.ones((len(pts), 1))], 1).reshape(-1)); sp.points.foreach_set('radius', np.full(len(pts), r))
    m = bpy.data.materials.new('Vine'); m.use_nodes = True; T = NT(m.node_tree); p = T.nt.nodes['Principled BSDF']; pos = T.node('ShaderNodeNewGeometry').outputs['Position']
    T.set(p, Base_Color=T.mix(T.ramp(T.noise(1.2, 3.0, 0.6, pos), [(0.45, (0, 0, 0, 1)), (0.7, (1, 1, 1, 1))]), lin('#2a2016'), lin('#33401a')), Roughness=0.8)
    bmp = T.node('ShaderNodeBump'); bmp.inputs['Strength'].default_value = 0.6; bmp.inputs['Distance'].default_value = 0.01; T.link(T.noise(60.0, 3.0, 0.6, pos), bmp.inputs['Height']); T.link(bmp.outputs['Normal'], p.inputs['Normal'])
    cu.materials.append(m); ob = bpy.data.objects.new('Vines', cu); coll.objects.link(ob); return ob, len(splines)


def _plant_kinds():
    """Scanned plants, each re-centred on its own root so it can be planted anywhere. -> {name: mesh object (not in the scene)}"""
    kinds = {}
    for asset, pick in (('fern_02', None), ('anthurium_botany_01', None), ('calathea_orbifolia_01', None), ('shrub_02', lambda n: n.endswith('LOD1')), ('weed_plant_02', lambda n: n.endswith('LOD1')), ('nettle_plant', lambda n: n.endswith('LOD1'))):
        for name, ob in assets.objects(asset, pick).items():
            if ob.type == 'MESH': ob.location = (0, 0, 0); kinds[name] = ob
    return kinds


def plants(L, coll, rng):
    """Ferns, broad-leaved plants and shrubs wherever the mud stands clear of the water, thickest round the feet of the trees."""
    kinds = _plant_kinds(); groups = dict(fern=[k for k in kinds if k.startswith('fern')], leaf=[k for k in kinds if k.startswith(('anthurium', 'calathea'))], shrub=[k for k in kinds if k.startswith('shrub')], weed=[k for k in kinds if k.startswith(('weed', 'nettle'))])
    n = 9000; x = rng.uniform(-40, 40, n); y = rng.uniform(-24, 60, n); z = ground_z(x, y, L); d0 = np.hypot(x, y)
    keep = (z > -0.03) & (rng.random(n) < np.clip(1.25 - d0 / 45.0, 0.12, 1.0)); out = []
    for xi, yi, zi in zip(x[keep], y[keep], z[keep]):
        if math.hypot(xi - L['bank'][0], yi - (L['bank'][1] - 0.3)) < 1.6: continue             # keep the spot he lies on clear
        g = rng.choice(['fern', 'leaf', 'shrub', 'weed'], p=[0.36, 0.30, 0.10, 0.24]); name = rng.choice(groups[g]); src = kinds[name]; ob = bpy.data.objects.new('P_' + name, src.data); coll.objects.link(ob)
        sc_ = {'fern': rng.uniform(0.8, 1.5), 'leaf': rng.uniform(0.9, 1.9), 'shrub': rng.uniform(0.7, 1.3), 'weed': rng.uniform(1.5, 3.5)}[g]
        ob.location = (xi, yi, zi - 0.02); ob.rotation_euler = (rng.normal(0, 0.06), rng.normal(0, 0.06), rng.uniform(0, 6.28)); ob.scale = (sc_,) * 3; out.append(ob)
    return out


def grass(L, coll, rng):
    """Swamp grass in tufts along every bank, thick where he wakes ("the grass met up to my eye view")."""
    tufts = []
    for k in range(6):                                                                    # six tuft shapes, instanced
        V = []; F = []; nb = int(rng.integers(14, 30))
        for _ in range(nb):
            ang = rng.uniform(0, 6.28); lean = rng.uniform(0.08, 0.55); h = rng.uniform(0.22, 0.62); w = rng.uniform(0.006, 0.012); base = np.array([rng.normal(0, 0.035), rng.normal(0, 0.035), -0.03]); d = np.array([math.cos(ang), math.sin(ang), 0.0]); side = np.array([-d[1], d[0], 0.0]); m_ = 6; i0 = len(V)
            for q in range(m_ + 1):
                t = q / m_; c = base + d * (lean * h * t * t * 1.6) + np.array([0, 0, h * (t - 0.28 * lean * t * t)]); ww = w * (1 - t) ** 0.8 + 0.0008; fold = np.array([0, 0, 0.0]) + d * (-0.004)
                V += [c - side * ww, c + fold * (1 - t), c + side * ww]
            for q in range(m_): a_ = i0 + q * 3; F += [(a_, a_ + 1, a_ + 4, a_ + 3), (a_ + 1, a_ + 2, a_ + 5, a_ + 4)]
        me = bpy.data.meshes.new(f'Tuft{k}'); me.from_pydata([tuple(v) for v in V], [], F); me.update(); tufts.append(me)
        for p_ in me.polygons: p_.use_smooth = True
    m = bpy.data.materials.new('SwampGrass'); m.use_nodes = True; nt = m.node_tree; T = NT(nt); p = nt.nodes['Principled BSDF']; geo = T.node('ShaderNodeNewGeometry'); z = T.node('ShaderNodeSeparateXYZ'); T.link(T.node('ShaderNodeTexCoord').outputs['Object'], z.inputs[0])
    info = T.node('ShaderNodeObjectInfo'); tip = T.math('MULTIPLY', z.outputs['Z'], 2.2, clamp=True)
    col = T.mix(tip, lin('#141a08'), T.mix(info.outputs['Random'], lin('#3c4a16'), lin('#5d6124')))
    T.set(p, Base_Color=col, Roughness=0.45, Specular_IOR_Level=0.4); tr = T.node('ShaderNodeBsdfTranslucent'); T.link(col, tr.inputs['Color']); mx = T.node('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.35
    T.link(p.outputs[0], mx.inputs[1]); T.link(tr.outputs[0], mx.inputs[2]); T.link(mx.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    for me in tufts: me.materials.append(m)
    out = []; n = 60000; x = rng.uniform(-26, 26, n); y = rng.uniform(-14, 40, n); z_ = ground_z(x, y, L); d0 = np.hypot(x, y - 0.6)
    shore = np.exp(-((z_ - 0.03) / 0.09) ** 2); keep = (rng.random(n) < shore * np.clip(1.6 - d0 / 14.0, 0.05, 1.0)) & (z_ > -0.12)
    for xi, yi, zi in zip(x[keep], y[keep], z_[keep]):
        ob = bpy.data.objects.new('Grass', tufts[int(rng.integers(0, 6))]); coll.objects.link(ob); ob.location = (xi, yi, zi); ob.rotation_euler = (0, 0, rng.uniform(0, 6.28)); s_ = rng.uniform(0.7, 1.5); ob.scale = (s_, s_, s_ * rng.uniform(0.8, 1.3)); out.append(ob)
    return out


def branch(L, coll):
    """The branch he gets out by: a long dead limb (scan), fallen across the corner of the pool with one end lodged in a tree."""
    src = list(assets.objects('dead_tree_trunk').values())[0]; ob = bpy.data.objects.new('Branch', src.data); coll.objects.link(ob)
    B = L['branch']; a = Vector(B['a']); b_ = Vector(B['b']); mid = (a + b_) / 2; d = (b_ - a); ob.location = mid; ob.rotation_euler = d.to_track_quat('X', 'Z').to_euler(); ob.scale = (d.length / 3.05, B['thick'] / 0.28, B['thick'] / 0.28)
    return ob


def fog(sc, coll, density=0.0045):
    """Air you can see: thin mist through the whole wood, so trees fade with distance and the sun shows as shafts."""
    V = [(-110, -98, -0.5), (110, -98, -0.5), (110, 130, -0.5), (-110, 130, -0.5), (-110, -98, 39), (110, -98, 39), (110, 130, 39), (-110, 130, 39)]; F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    m = bpy.data.materials.new('SwampAir'); m.use_nodes = True; nt = m.node_tree; T = NT(nt)
    for n in list(nt.nodes): nt.nodes.remove(n)
    o = T.node('ShaderNodeOutputMaterial'); v = T.node('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = (0.70, 0.86, 0.74, 1); v.inputs['Density'].default_value = density; v.inputs['Anisotropy'].default_value = 0.55; v.inputs['Absorption Color'].default_value = (0.25, 0.45, 0.30, 1)
    T.link(v.outputs[0], o.inputs['Volume']); ob = _mesh('SwampAir', V, F, m, smooth=False, coll=coll); ob.visible_shadow = False; return ob


# ------------------------------------------------------------------------------------------------ light
def _area(name, loc, target, energy, colour, size, sc, spread=180.0, size_y=None):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.color = colour; d.size = size; d.spread = math.radians(spread)
    if size_y: d.shape = 'RECTANGLE'; d.size_y = size_y
    ob = bpy.data.objects.new(name, d); ob.location = loc; ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(ob); return ob


def _gobo(name, light, dist, size, scale, open_=0.5, sc=None):
    """A screen of leaf-shaped holes hung in front of a lamp (seen by nothing, it only throws shadows)."""
    m = bpy.data.materials.get('LeafScreen')
    if m is None:
        m = bpy.data.materials.new('LeafScreen'); m.use_nodes = True; nt = m.node_tree; T = NT(nt)
        for n in list(nt.nodes): nt.nodes.remove(n)
        o = T.node('ShaderNodeOutputMaterial'); uv = T.node('ShaderNodeTexCoord').outputs['Object']; v = T.node('ShaderNodeTexVoronoi', feature='F1'); v.inputs['Scale'].default_value = 9.0; T.link(uv, v.inputs['Vector'])
        big = T.noise(1.3, 3.0, 0.6, uv); val = T.node('ShaderNodeValue'); val.name = 'Open'; val.outputs[0].default_value = open_
        hole = T.math('LESS_THAN', T.math('ADD', T.math('MULTIPLY', v.outputs['Distance'], 0.9), T.math('SUBTRACT', 1.0, big)), val.outputs[0])
        dark = T.node('ShaderNodeBsdfDiffuse'); dark.inputs['Color'].default_value = (0, 0, 0, 1); clear = T.node('ShaderNodeBsdfTransparent'); mx = T.node('ShaderNodeMixShader'); T.link(hole, mx.inputs[0]); T.link(dark.outputs[0], mx.inputs[1]); T.link(clear.outputs[0], mx.inputs[2]); T.link(mx.outputs[0], o.inputs['Surface'])
    ob = _mesh(name, [(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)], [(0, 1, 2, 3)], m, smooth=False, coll=sc.collection)
    M = light.matrix_world if light.matrix_world != Matrix.Identity(4) else light.matrix_basis; ob.matrix_world = M @ Matrix.Translation((0, 0, -dist)) @ Matrix.Scale(scale, 4)
    ob.visible_camera = False; ob.visible_diffuse = False; ob.visible_glossy = False; ob.visible_transmission = False; ob.visible_volume_scatter = False; return ob


def sky(sc, ambient=0.015, gap=16000.0, sun=70000.0, far=10000.0, tint=(0.62, 0.92, 0.78)):
    """Lit the way a film crew would light a wood: almost nothing from the sky itself (the roof is shut), a pool of cold
    daylight falling through one gap above the water, and the low sun slanting in from ahead-left in a few warm shafts,
    both broken up by leaf-cut screens. Everything further off is left to fall away into the dark."""
    w = bpy.data.worlds.new('SwampSky'); w.use_nodes = True; sc.world = w; nt = w.node_tree; T = NT(nt); bg = nt.nodes['Background']
    env = T.node('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(assets.hdri('kloofendal_misty_morning_puresky'), check_existing=True)
    mul = T.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); mul.inputs[0].default_value = 1.0; T.link(env.outputs['Color'], mul.inputs[6]); mul.inputs[7].default_value = (*tint, 1)
    T.link(mul.outputs[2], bg.inputs['Color']); bg.inputs['Strength'].default_value = ambient
    out = dict(world=w)
    out['gap'] = _area('SkyGap', (0.5, 4.5, 20.0), (0.5, 3.0, 0.0), gap, (0.74, 0.95, 0.86), 5.0, sc, spread=60.0)
    out['sun'] = _area('SunShafts', (-15.0, 27.0, 19.0), (0.5, 2.0, 0.3), sun, (1.0, 0.84, 0.58), 1.6, sc, spread=24.0)
    out['far'] = _area('FarGlow', (6.0, 48.0, 18.0), (2.0, 32.0, 0.0), far, (0.60, 0.90, 0.80), 12.0, sc, spread=80.0)        # a second, dimmer gap deep in the trees: something for the rows to stand against
    bpy.context.view_layer.update()
    out['gobos'] = [_gobo('GapScreen', out['gap'], 4.0, 6.0, 1.0, 0.62, sc), _gobo('SunScreen', out['sun'], 6.0, 5.0, 1.0, 0.62, sc), _gobo('FarScreen', out['far'], 4.0, 12.0, 1.0, 0.62, sc)]
    return out


def build(sc, seed=4, parts=('ground', 'water', 'trees', 'canopy', 'vines', 'plants', 'grass', 'branch', 'fog'), fog_density=0.0045, light=None):
    t0 = time.time(); L = layout(seed); coll = bpy.data.collections.new('Swamp'); sc.collection.children.link(coll); rng = np.random.default_rng(seed + 100); out = dict(layout=L)
    if 'ground' in parts: out['ground'] = terrain(L)
    if 'water' in parts: out['water'] = water()
    if 'trees' in parts: out['trees'] = trees(L, coll)
    if 'canopy' in parts: out['canopy'] = canopy(L, coll, rng)
    if 'vines' in parts: out['vines'], nv = vines(L, coll, rng)
    if 'plants' in parts: out['plants'] = plants(L, coll, rng)
    if 'grass' in parts: out['grass'] = grass(L, coll, rng)
    if 'branch' in parts: out['branch'] = branch(L, coll)
    if 'fog' in parts: out['fog'] = fog(sc, coll, fog_density)
    out['sky'] = sky(sc, **(light or {})); sc.cycles.transparent_max_bounces = 24; sc.cycles.volume_bounces = 0; zone_all()
    print(f'swamp built in {time.time() - t0:.1f}s: {len(L["trees"])} trees, {len(out.get("plants", []))} plants, {len(out.get("grass", []))} tufts', flush=True); return out


# ------------------------------------------------------------------------------------------------ test stand
CAMS = {'wide': ((0.6, -7.5, 1.5), (0.0, 6.0, 1.6), 28), 'low': ((1.2, -3.2, 0.22), (0.0, 3.0, 0.9), 24), 'up': ((0.3, 0.4, 0.9), (0.6, 2.5, 12.0), 20), 'bank': ((3.2, -2.4, 1.1), (0.0, 0.6, 0.3), 35), 'far': ((0.0, -18.0, 6.0), (0.0, 20.0, 2.0), 30)}

if __name__ == '__main__':
    import studio, machine
    arg, flag = studio.arg, studio.flag; out = sys.argv[1]; t0 = time.time(); sc = studio.reset()
    w, h = (int(v) for v in arg('--size', '960x402').split('x')); sc.render.resolution_x = w; sc.render.resolution_y = h
    light = {k: float(arg('--' + k)) for k in ('ambient', 'gap', 'sun', 'far') if arg('--' + k) is not None}
    S_ = build(sc, int(arg('--seed', 4)), parts=tuple(arg('--parts', 'ground,water,trees,canopy,vines,plants,grass,branch,fog').split(',')), fog_density=float(arg('--fogd', 0.0045)), light=light)
    pos, look, fl = CAMS[arg('--cam', 'wide')]; v3 = lambda t: tuple(float(v) for v in t.split(','))
    if arg('--pos'): pos = v3(arg('--pos'))
    if arg('--look'): look = v3(arg('--look'))
    cd = bpy.data.cameras.new('Cam'); cd.lens = float(arg('--lens', fl)); cd.sensor_width = 36; cd.clip_end = 400; cam = bpy.data.objects.new('Cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = pos; cam.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler(); dev = machine.pick(sc, arg('--device'))
    sc.render.filepath = os.path.abspath(out); bpy.ops.render.render(write_still=True); print(f'rendered {out} in {time.time() - t0:.0f}s on {dev}')
