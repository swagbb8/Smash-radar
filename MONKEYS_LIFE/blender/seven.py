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
import device
import skinpaint

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


def mud_field():
    """One swamp-mud field for the whole character (a node group, so skin, fur and the device all agree on where the mud is).
    In: a position in his rest space (cm). Out: Mud (0..1 covered), Thick (0..1 how caked), Wet (1 dripping .. 0 dried).
    Inside sit two values to animate: MudLevel (0 clean .. 1 caked head to toe) and MudWet."""
    g = bpy.data.node_groups.get('MudField')
    if g: return g
    g = bpy.data.node_groups.new('MudField', 'ShaderNodeTree'); g.interface.new_socket('Position', in_out='INPUT', socket_type='NodeSocketVector')
    for name in ('Mud', 'Thick', 'Wet'): g.interface.new_socket(name, in_out='OUTPUT', socket_type='NodeSocketFloat')
    T = NT(g); gi = T.node('NodeGroupInput'); go = T.node('NodeGroupOutput'); pos = gi.outputs['Position']
    level = T.node('ShaderNodeValue'); level.name = level.label = 'MudLevel'; level.outputs[0].default_value = 0.0
    wet = T.node('ShaderNodeValue'); wet.name = wet.label = 'MudWet'; wet.outputs[0].default_value = 1.0
    n = T.math('ADD', T.math('MULTIPLY', T.noise(0.075, 3.0, 0.55, pos), 0.62), T.math('MULTIPLY', T.noise(0.42, 3.0, 0.6, pos), 0.38))      # big patches, ragged edges
    n = T.math('DIVIDE', T.math('SUBTRACT', n, 0.30), 0.40, clamp=True)                                                        # spread to the full 0..1
    sep = T.node('ShaderNodeSeparateXYZ'); T.link(pos, sep.inputs[0]); low = T.math('SUBTRACT', 1.0, T.math('DIVIDE', sep.outputs['Z'], 150.0), clamp=True)
    x = T.math('SUBTRACT', T.math('ADD', T.math('SUBTRACT', T.math('MULTIPLY', level.outputs[0], 1.30), 0.14), T.math('MULTIPLY', T.math('MULTIPLY', low, 0.30), level.outputs[0])), n)   # mud clings longest low down
    def ramp01(v, lo, hi):
        m_ = T.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); T.link(v, m_.inputs['Value']); m_.inputs['From Min'].default_value = lo; m_.inputs['From Max'].default_value = hi; return m_.outputs['Result']
    T.link(ramp01(x, 0.0, 0.10), go.inputs['Mud']); T.link(ramp01(x, 0.05, 0.50), go.inputs['Thick']); T.link(wet.outputs[0], go.inputs['Wet'])
    return g


def cake_field():
    """A lump of swamp mud dried over the device, hiding it until the water washes it off. Inside: Cake (0 none .. 1 buried)."""
    g = bpy.data.node_groups.get('DeviceCake')
    if g: return g
    g = bpy.data.node_groups.new('DeviceCake', 'ShaderNodeTree'); g.interface.new_socket('Cake', in_out='OUTPUT', socket_type='NodeSocketFloat'); T = NT(g); go = T.node('NodeGroupOutput')
    v = T.node('ShaderNodeValue'); v.name = v.label = 'Cake'; v.outputs[0].default_value = 0.0; T.link(v.outputs[0], go.inputs['Cake']); return g


def device_cake(value):
    cake_field().nodes['Cake'].outputs[0].default_value = value


def _mud(T, position):
    n = T.node('ShaderNodeGroup'); n.node_tree = mud_field(); T.link(position, n.inputs['Position']); return n.outputs['Mud'], n.outputs['Thick'], n.outputs['Wet']


MUD_WET, MUD_DRY = '#221a12', '#6e5d4a'


def _material(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; return m, NT(nt), nt.nodes['Principled BSDF']


def _image(nt, path, colour=False, uv='HeadUV'):
    img = bpy.data.images.load(path, check_existing=True)
    if not colour: img.colorspace_settings.name = 'Non-Color'
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; n.extension = 'EXTEND'; n.interpolation = 'Cubic'
    u = nt.nodes.new('ShaderNodeUVMap'); u.uv_map = uv; nt.links.new(u.outputs['UV'], n.inputs['Vector']); return n


def skin_material(maps):
    """Ape skin. The head is painted (skinpaint.py: nostrils, folds, wrinkles, mottled muzzle); the rest of the body is
    procedural leather. The device in the left forearm glows through it."""
    m, T, p = _material('SevenSkin'); nt = T.nt
    rest = T.node('ShaderNodeAttribute', attribute_name='rest_position'); obj = rest.outputs['Vector']      # textures stay glued to the skin when he moves
    face = T.attr('face'); palm = T.math('MAXIMUM', T.attr('palm'), T.attr('sole')); paint = T.attr('paint')
    blotch = T.noise(0.9, 5.0, 0.6, obj); fine = T.noise(9.0, 3.0, 0.5, obj)
    base = T.mix(T.ramp(blotch, [(0.30, (0.0, 0.0, 0.0, 1)), (0.80, (1, 1, 1, 1))]), lin('#17110f'), lin('#2a1e19'))
    base = T.mix(palm, base, lin('#2b2320')); base = T.mix(T.math('MULTIPLY', fine, 0.25), base, lin('#0e0b0a'))
    # creases on the body skin: stretched cells, stronger on the hands and feet
    vor = T.node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); vor.inputs['Scale'].default_value = 5.5; map_ = T.node('ShaderNodeMapping'); map_.inputs['Scale'].default_value = (1.0, 1.0, 2.6)
    T.link(obj, map_.inputs['Vector']); T.link(map_.outputs['Vector'], vor.inputs['Vector'])
    crease = T.math('SUBTRACT', 1.0, T.math('MULTIPLY', vor.outputs['Distance'], 9.0, clamp=True), clamp=True)
    amount = T.math('ADD', 0.25, T.math('MULTIPLY', T.math('MAXIMUM', face, palm), 0.75))
    height = T.math('ADD', T.math('MULTIPLY', T.math('MULTIPLY', crease, amount), -1.0), T.math('MULTIPLY', fine, 0.35))
    height = T.math('MULTIPLY', height, T.math('SUBTRACT', 1.0, paint))                                   # the painted head brings its own relief
    bump = T.node('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.55; bump.inputs['Distance'].default_value = 0.004
    # the painted head
    ic = _image(nt, maps['colour'], colour=True); ih = _image(nt, maps['height']); ir = _image(nt, maps['rough'])
    base = T.mix(paint, base, ic.outputs['Color']); rough = T.mix(paint, T.math('ADD', 0.62, T.math('MULTIPLY', fine, 0.25)), ir.outputs['Color'])
    disp = T.node('ShaderNodeDisplacement'); disp.space = 'OBJECT'; disp.inputs['Midlevel'].default_value = 0.0; disp.inputs['Scale'].default_value = 1.0
    T.link(T.math('MULTIPLY', T.math('MULTIPLY', T.math('SUBTRACT', ih.outputs['Color'], 0.5), skinpaint.HRANGE), paint), disp.inputs['Height'])
    T.link(disp.outputs['Displacement'], nt.nodes['Material Output'].inputs['Displacement']); m.displacement_method = 'BOTH'
    # the device (device.py): scar tissue hugging the frame, a seam up the arm, circuit lines under the skin that glow when it wakes
    du = T.attr('dev_u'); dv = T.attr('dev_v'); on = T.attr('dev_on'); comb = T.node('ShaderNodeCombineXYZ')
    T.link(T.math('ADD', T.math('DIVIDE', du, 2 * device.SKIN_U * device.A), 0.5), comb.inputs[0]); T.link(T.math('ADD', T.math('DIVIDE', dv, 2 * device.SKIN_V * device.B), 0.5), comb.inputs[1])
    dimg = bpy.data.images.load(device.maps()['skin'], check_existing=True); dimg.colorspace_settings.name = 'Non-Color'; dn = nt.nodes.new('ShaderNodeTexImage'); dn.image = dimg; dn.extension = 'EXTEND'; T.link(comb.outputs[0], dn.inputs['Vector'])
    sep = T.node('ShaderNodeSeparateColor'); T.link(dn.outputs['Color'], sep.inputs[0]); traces = T.math('MULTIPLY', sep.outputs[0], on); scar = T.math('MULTIPLY', sep.outputs[1], on); halo = T.math('MULTIPLY', sep.outputs[2], on)
    power = T.node('ShaderNodeValue'); power.name = power.label = 'DevicePower'; power.outputs[0].default_value = 0.0
    wave = T.node('ShaderNodeValue'); wave.name = wave.label = 'DeviceWave'; wave.outputs[0].default_value = -10.0           # cm from the frame: where a pulse running out along the lines has got to
    base = T.mix(T.math('MULTIPLY', scar, 0.85), base, T.mix(blotch, lin('#7d5b55'), lin('#a07a70'))); base = T.mix(T.math('MULTIPLY', traces, 0.6), base, lin('#0c1218'))
    rough = T.mix(scar, rough, (0.36, 0.36, 0.36, 1))
    far = T.math('MAXIMUM', T.math('MAXIMUM', T.math('SUBTRACT', T.math('ABSOLUTE', du), device.A), T.math('SUBTRACT', T.math('ABSOLUTE', dv), device.B)), 0.0)      # how far out along the arm
    front = T.math('SUBTRACT', far, wave.outputs[0]); pulse = T.math('POWER', 2.718, T.math('MULTIPLY', T.math('MULTIPLY', front, front), -1.0 / (1.4 * 1.4)))
    level = T.math('ADD', T.math('MULTIPLY', power.outputs[0], 0.10), pulse)                                              # a dim steady glow when it is awake, bright where the pulse is passing
    emis = T.math('MULTIPLY', T.math('ADD', traces, T.math('MULTIPLY', halo, 0.35)), level)
    # swamp mud over everything: dark and glossy while wet, lumpy where it is caked on
    mud, thick, wet = _mud(T, obj); lumps = T.noise(1.7, 4.0, 0.65, obj); grit = T.noise(14.0, 2.0, 0.5, obj)
    mudcol = T.mix(T.math('MULTIPLY', lumps, 0.8), T.mix(wet, lin(MUD_DRY), lin(MUD_WET)), T.mix(wet, lin('#84735f'), lin('#191611')))
    sheen = T.ramp(T.noise(0.9, 3.0, 0.6, obj), [(0.42, (0.64, 0.64, 0.64, 1)), (0.66, (0.36, 0.36, 0.36, 1))])                # dull wet earth, a little slicker in places (never a mirror: that reads as rubber)
    base = T.mix(mud, base, mudcol); rough = T.mix(mud, rough, T.mix(wet, (0.88, 0.88, 0.88, 1), sheen))
    T.set(p, Base_Color=base, Roughness=rough, Specular_IOR_Level=T.math('ADD', 0.35, T.math('MULTIPLY', T.math('MULTIPLY', mud, wet), 0.15)), Subsurface_Weight=T.math('MULTIPLY', T.math('SUBTRACT', 1.0, mud), 0.10), Subsurface_Scale=0.003, Normal=bump.outputs['Normal'],
          Emission_Color=lin('#2f9dff'), Emission_Strength=T.math('MULTIPLY', T.math('MULTIPLY', emis, T.math('SUBTRACT', 1.0, T.math('MULTIPLY', thick, 0.85))), 5.0))
    mud_h = T.math('MULTIPLY', thick, T.math('ADD', 0.25, T.math('ADD', T.math('MULTIPLY', lumps, 1.2), T.math('MULTIPLY', grit, 0.35))))          # 0..~1.6: lumpy and gritty
    md = T.math('ADD', T.math('MULTIPLY', T.math('MULTIPLY', T.math('SUBTRACT', ih.outputs['Color'], 0.5), skinpaint.HRANGE), T.math('MULTIPLY', paint, T.math('SUBTRACT', 1.0, T.math('MULTIPLY', thick, 0.7)))), T.math('MULTIPLY', mud_h, 0.22))
    T.link(md, disp.inputs['Height'])                                                           # caked mud fills the wrinkles and stands up to ~3 mm proud
    p.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    h2 = T.math('ADD', height, T.math('ADD', T.math('MULTIPLY', scar, T.math('ADD', 1.6, T.math('MULTIPLY', fine, 1.2))), T.math('MULTIPLY', traces, 0.9))); T.link(h2, bump.inputs['Height'])      # scar and wires stand proud
    return m


def device_object(b, arm):
    """The thing itself: a worn metal frame and a shattered screen, set into the top of his left forearm and moving with it."""
    V, F, M, uv, wear, fuv = device.mesh(b); me = bpy.data.meshes.new('SevenDevice'); me.from_pydata([tuple(q) for q in V], [], F); me.update()
    for p_ in me.polygons: p_.use_smooth = True
    loops = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', loops)
    me.uv_layers.new(name='GlassUV').data.foreach_set('uv', uv[loops].reshape(-1)); me.uv_layers.new(name='FrameUV').data.foreach_set('uv', fuv[loops].reshape(-1))
    me.attributes.new('wear', 'FLOAT', 'POINT').data.foreach_set('value', wear)
    # frame: dark brushed metal, bright where the edges have worn
    mf, T, p = _material('DeviceFrame'); nt = T.nt; obj = T.node('ShaderNodeTexCoord').outputs['Object']
    mp = T.node('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.6, 14.0, 14.0); T.link(obj, mp.inputs['Vector']); brushed = T.noise(3.0, 4.0, 0.6, mp.outputs['Vector']); grime = T.noise(0.5, 4.0, 0.6, obj)
    wear_ = T.math('MULTIPLY', T.attr('wear'), T.math('ADD', 0.4, grime), clamp=True)
    T.set(p, Base_Color=T.mix(T.math('MULTIPLY', wear_, 0.6), T.mix(grime, lin('#15171a'), lin('#2a2d31')), lin('#6d7176')), Metallic=1.0, Roughness=T.math('ADD', 0.30, T.math('MULTIPLY', brushed, 0.28)))
    bm_ = T.node('ShaderNodeBump'); bm_.inputs['Strength'].default_value = 0.25; bm_.inputs['Distance'].default_value = 0.02; T.link(brushed, bm_.inputs['Height']); T.link(bm_.outputs['Normal'], p.inputs['Normal'])
    rest = T.node('ShaderNodeAttribute', attribute_name='rest_position').outputs['Vector']; mud, thick, wet = _mud(T, rest); mudcol = T.mix(wet, lin(MUD_DRY), lin(MUD_WET))
    ck = T.node('ShaderNodeGroup'); ck.node_tree = cake_field(); mud = T.math('MAXIMUM', mud, ck.outputs['Cake'])
    fb = [l.from_socket for l in p.inputs['Base Color'].links][0]; fr = [l.from_socket for l in p.inputs['Roughness'].links][0]
    T.link(T.mix(mud, fb, mudcol), p.inputs['Base Color']); T.link(T.mix(mud, fr, T.mix(wet, (0.85, 0.85, 0.85, 1), (0.30, 0.30, 0.30, 1))), p.inputs['Roughness']); T.link(T.math('SUBTRACT', 1.0, mud), p.inputs['Metallic'])
    # glass: black, cracked from one hit, the dead display under it still giving a faint pulse
    mg, G, pg = _material('DeviceGlass'); ng = G.nt; img = _image(ng, device.maps()['glass'], uv='GlassUV'); img.interpolation = 'Linear'
    sep = G.node('ShaderNodeSeparateColor'); G.link(img.outputs['Color'], sep.inputs[0]); crack, crush, disp = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    broken = G.math('MAXIMUM', crack, G.math('MULTIPLY', crush, 0.9), clamp=True)
    power = G.node('ShaderNodeValue'); power.name = power.label = 'DevicePower'; power.outputs[0].default_value = 0.0
    lit = G.math('MULTIPLY', G.math('ADD', disp, G.math('MULTIPLY', crack, 0.10)), power.outputs[0])
    G.set(pg, Base_Color=G.mix(G.math('MULTIPLY', broken, 0.55), lin('#030405'), lin('#9fa6ad')), Roughness=G.math('ADD', 0.05, G.math('MULTIPLY', broken, 0.55)), Specular_IOR_Level=0.6, Coat_Weight=G.math('SUBTRACT', 1.0, broken), Coat_Roughness=0.03,
          Emission_Color=lin('#3aa8ff'), Emission_Strength=G.math('MULTIPLY', lit, 7.0))
    bg = G.node('ShaderNodeBump'); bg.inputs['Strength'].default_value = 0.6; bg.inputs['Distance'].default_value = 0.012; G.link(G.math('MULTIPLY', broken, -1.0), bg.inputs['Height']); G.link(bg.outputs['Normal'], pg.inputs['Normal'])
    restg = G.node('ShaderNodeAttribute', attribute_name='rest_position').outputs['Vector']; mud, thick, wet = _mud(G, restg); mudcol = G.mix(wet, lin(MUD_DRY), lin(MUD_WET)); smear = G.math('MULTIPLY', mud, G.math('ADD', 0.55, G.math('MULTIPLY', thick, 0.45)))
    ckg = G.node('ShaderNodeGroup'); ckg.node_tree = cake_field(); smear = G.math('MAXIMUM', smear, ckg.outputs['Cake'])
    gb = [l.from_socket for l in pg.inputs['Base Color'].links][0]; gr = [l.from_socket for l in pg.inputs['Roughness'].links][0]; ge = [l.from_socket for l in pg.inputs['Emission Strength'].links][0]; gc = [l.from_socket for l in pg.inputs['Coat Weight'].links][0]
    G.link(G.mix(smear, gb, mudcol), pg.inputs['Base Color']); G.link(G.mix(smear, gr, G.mix(wet, (0.85, 0.85, 0.85, 1), (0.30, 0.30, 0.30, 1))), pg.inputs['Roughness'])
    G.link(G.math('MULTIPLY', ge, G.math('SUBTRACT', 1.0, G.math('MULTIPLY', smear, 0.92))), pg.inputs['Emission Strength']); G.link(G.math('MULTIPLY', gc, G.math('SUBTRACT', 1.0, smear)), pg.inputs['Coat Weight'])     # mud dulls the glass and hides the light under it
    me.materials.append(mf); me.materials.append(mg); me.polygons.foreach_set('material_index', np.array(M, np.int32))
    ob = bpy.data.objects.new('SevenDevice', me); bpy.context.scene.collection.objects.link(ob); ob.add_rest_position_attribute = True; ob.vertex_groups.new(name='LeftForeArm').add(list(range(len(V))), 1.0, 'REPLACE')
    ob.parent = arm; ob.modifiers.new('Armature', 'ARMATURE').object = arm
    return ob, (mf, mg)


def eye_materials():
    """A real eye in two layers: a wet shell (dark ape sclera, clear cornea that bends light) over an amber iris set back inside it."""
    m = bpy.data.materials.new('SevenEyeShell'); m.use_nodes = True; nt = m.node_tree; T = NT(nt)
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = T.node('ShaderNodeOutputMaterial'); rest = T.node('ShaderNodeAttribute', attribute_name='rest_position').outputs['Vector']
    cornea = T.attr('cornea'); limb = T.attr('limb')
    blot = T.noise(2.2, 4.0, 0.6, rest); col = T.mix(blot, lin('#2a1810'), lin('#4b2d1e')); col = T.mix(T.math('MULTIPLY', limb, 0.9), col, lin('#080504'))
    sclera = T.node('ShaderNodeBsdfPrincipled'); T.set(sclera, Base_Color=col, Roughness=0.16, Coat_Weight=1.0, Coat_Roughness=0.03, Specular_IOR_Level=0.6, Subsurface_Weight=0.2, Subsurface_Scale=0.002)
    glass = T.node('ShaderNodeBsdfGlass'); glass.inputs['IOR'].default_value = 1.376; glass.inputs['Roughness'].default_value = 0.0
    clear = T.node('ShaderNodeBsdfTransparent'); lp = T.node('ShaderNodeLightPath')
    lens = T.node('ShaderNodeMixShader'); T.link(T.math('MAXIMUM', lp.outputs['Is Shadow Ray'], lp.outputs['Is Diffuse Ray']), lens.inputs[0]); T.link(glass.outputs[0], lens.inputs[1]); T.link(clear.outputs[0], lens.inputs[2])
    mix = T.node('ShaderNodeMixShader'); T.link(cornea, mix.inputs[0]); T.link(sclera.outputs[0], mix.inputs[1]); T.link(lens.outputs[0], mix.inputs[2]); T.link(mix.outputs[0], out.inputs['Surface'])
    # iris
    mi, I, p = _material('SevenIris'); ix = I.attr('iris_x'); iy = I.attr('iris_y')
    rho = I.math('SQRT', I.math('ADD', I.math('MULTIPLY', ix, ix), I.math('MULTIPLY', iy, iy))); safe = I.math('MAXIMUM', rho, 0.001)
    comb = I.node('ShaderNodeCombineXYZ'); I.link(I.math('MULTIPLY', I.math('DIVIDE', ix, safe), 5.5), comb.inputs[0]); I.link(I.math('MULTIPLY', I.math('DIVIDE', iy, safe), 5.5), comb.inputs[1]); I.link(I.math('MULTIPLY', rho, 1.4), comb.inputs[2])
    fibre = I.noise(3.0, 6.0, 0.7, comb.outputs[0]); fine = I.noise(11.0, 3.0, 0.6, comb.outputs[0])
    pu = ape.EYE['pupil']
    base = I.ramp(rho, [(0.0, (0, 0, 0, 1)), (pu, (0, 0, 0, 1)), (pu + 0.035, lin('#1c0d05')), (pu + 0.15, lin('#8a5518')), (0.72, lin('#6a3f12')), (0.90, lin('#2a1608')), (0.985, lin('#060302'))])
    streak = I.math('ADD', 0.45, I.math('MULTIPLY', I.math('ADD', fibre, I.math('MULTIPLY', fine, 0.5)), 0.75))
    mul = I.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); mul.inputs[0].default_value = 1.0; I.link(base, mul.inputs[6]); I.link(streak, mul.inputs[7])
    I.set(p, Base_Color=mul.outputs[2], Roughness=0.55, Specular_IOR_Level=0.15)
    return m, mi


def _eye_geo(c, r, nth=64, nph=56, nr=14):
    """One eyeball in rest space, looking along -Y. -> (verts, faces, material index per face, per-vertex attributes)"""
    lim, bulge = ape.EYE['limbus'], ape.EYE['bulge']
    th = np.pi * np.linspace(0, 1, nth + 1) ** 1.55; ph = np.linspace(0, 2 * np.pi, nph, endpoint=False)          # more rings toward the front
    R = r * (1 + bulge * np.cos(np.pi / 2 * np.clip(th / (lim * 1.15), 0, 1)) ** 2)
    V = [np.array([0, -R[0], 0])]; cor = [1.0]; limb = [0.0]
    for i in range(1, nth):
        for f in ph: V.append(R[i] * np.array([np.sin(th[i]) * np.cos(f), -np.cos(th[i]), np.sin(th[i]) * np.sin(f)]))
        k = 1 - float(np.clip((th[i] - 0.93 * lim) / (0.14 * lim), 0, 1)); cor += [k * k * (3 - 2 * k)] * nph; limb += [float(np.exp(-0.5 * ((th[i] - 1.12 * lim) / (0.16 * lim)) ** 2))] * nph
    V.append(np.array([0, R[-1], 0])); cor.append(0.0); limb.append(0.0); back = len(V) - 1
    ring = lambda i, j: 1 + (i - 1) * nph + (j % nph); F = []
    for j in range(nph): F.append((0, ring(1, j), ring(1, j + 1)))
    for i in range(1, nth - 1):
        for j in range(nph): F.append((ring(i, j), ring(i + 1, j), ring(i + 1, j + 1), ring(i, j + 1)))
    for j in range(nph): F.append((back, ring(nth - 1, j + 1), ring(nth - 1, j)))
    ns = len(V); mat = [0] * len(F); ix = [0.0] * ns; iy = [0.0] * ns
    # the iris: a shallow dish set back behind the cornea
    Ri = r * np.sin(lim) * 1.05; base = len(V); V.append(np.array([0, -(r * np.cos(lim) - 0.085 * r), 0])); ix.append(0.0); iy.append(0.0)
    for q in range(1, nr + 1):
        rho = q / nr
        for f in ph: V.append(np.array([rho * Ri * np.cos(f), -(r * np.cos(lim) - 0.025 * r - 0.06 * r * (1 - rho) ** 1.5), rho * Ri * np.sin(f)])); ix.append(rho * np.cos(f)); iy.append(rho * np.sin(f))
    iring = lambda q, j: base + 1 + (q - 1) * nph + (j % nph)
    for j in range(nph): F.append((base, iring(1, j), iring(1, j + 1))); mat.append(1)
    for q in range(1, nr):
        for j in range(nph): F.append((iring(q, j), iring(q + 1, j), iring(q + 1, j + 1), iring(q, j + 1))); mat.append(1)
    n = len(V); pad = lambda a: np.array(list(a) + [0.0] * (n - len(a)), np.float32)
    return np.array(V) + c, F, mat, dict(cornea=pad(cor), limb=pad(limb), iris_x=np.array(ix, np.float32), iris_y=np.array(iy, np.float32))


def eyes(b, arm):
    """Both eyeballs as one object, each skinned to its own eye bone."""
    V, F, M, A, grp = [], [], [], {}, []
    for s, bone in (('l', 'LeftEye'), ('r', 'RightEye')):
        v, f, mt, at = _eye_geo(b['marks']['eye'][s], b['marks']['eye_r'] * 0.995); o = sum(len(q) for q in V)
        V.append(v); F += [tuple(i + o for i in q) for q in f]; M += mt; grp.append((bone, o, len(v)))
        for k, a in at.items(): A.setdefault(k, []).append(a)
    V = np.concatenate(V); me = bpy.data.meshes.new('SevenEyes'); me.from_pydata([tuple(q) for q in V], [], F); me.update()
    for p_ in me.polygons: p_.use_smooth = True
    for k, a in A.items(): me.attributes.new(k, 'FLOAT', 'POINT').data.foreach_set('value', np.concatenate(a))
    shell, iris = eye_materials(); me.materials.append(shell); me.materials.append(iris); me.polygons.foreach_set('material_index', np.array(M, np.int32))
    ob = bpy.data.objects.new('SevenEyes', me); bpy.context.scene.collection.objects.link(ob); ob.add_rest_position_attribute = True
    for bone, o, n in grp: ob.vertex_groups.new(name=bone).add(list(range(o, o + n)), 1.0, 'REPLACE')
    ob.parent = arm; ob.modifiers.new('Armature', 'ARMATURE').object = arm
    return ob


def simple(name, colour, rough=0.4, sss=0.0):
    m, T, p = _material(name); T.set(p, Base_Color=lin(colour), Roughness=rough, Subsurface_Weight=sss); return m


def fur_material():
    """Coarse black chimp hair, glossy along the strand, with white hairs on the chin and the odd grey one elsewhere.
    Swamp mud (the shared MudField, looked up at each strand's root) coats strands brown; wet hair is slicker."""
    m = bpy.data.materials.new('SevenFur'); m.use_nodes = True; nt = m.node_tree; T = NT(nt)
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = T.node('ShaderNodeOutputMaterial'); hair = T.node('ShaderNodeBsdfHairPrincipled', parametrization='MELANIN'); info = T.node('ShaderNodeHairInfo')
    rnd = info.outputs['Random']; grey = T.attr('grey'); root = T.node('ShaderNodeAttribute', attribute_name='root').outputs['Vector']
    mud, thick, wet = _mud(T, root); soak = T.attr('wet')                                    # 'wet' per strand: how soaked the coat was when it was groomed
    slick = T.math('MULTIPLY', soak, wet)
    T.set(hair, Melanin=T.math('SUBTRACT', 1.0, T.math('MULTIPLY', grey, 0.80)), Melanin_Redness=T.math('MULTIPLY', T.math('SUBTRACT', 1.0, grey), 0.22), Roughness=T.math('SUBTRACT', 0.30, T.math('MULTIPLY', slick, 0.05)),
          Radial_Roughness=0.60, Coat=T.math('MULTIPLY', slick, 0.22), Random_Color=0.12, Random_Roughness=0.3)
    T.link(rnd, hair.inputs['Random'])
    mb = T.node('ShaderNodeBsdfPrincipled'); tone = T.math('ADD', T.math('MULTIPLY', rnd, 0.5), T.math('MULTIPLY', T.noise(0.9, 2.0, 0.5, root), 0.5))
    T.set(mb, Base_Color=T.mix(tone, T.mix(wet, lin(MUD_DRY), lin(MUD_WET)), T.mix(wet, lin('#84735f'), lin('#191611'))), Roughness=T.math('SUBTRACT', 0.85, T.math('MULTIPLY', wet, 0.28)), Specular_IOR_Level=0.3)
    tipward = T.math('ADD', T.math('MULTIPLY', mud, 0.75), T.math('MULTIPLY', T.math('MULTIPLY', thick, info.outputs['Intercept']), 0.6), clamp=True)   # the outside of the coat is caked first
    mix = T.node('ShaderNodeMixShader'); T.link(tipward, mix.inputs[0]); T.link(hair.outputs['BSDF'], mix.inputs[1]); T.link(mb.outputs['BSDF'], mix.inputs[2]); T.link(mix.outputs[0], out.inputs['Surface'])
    return m


# ------------------------------------------------------------------------------------------------ fur
def fur_strands(b, count=450000, k=7, seed=3, wet=0.0):
    """Hair as real strands: roots spread over the furry skin (thick here, thin there, a few mangy patches), lying along
    the hair-flow field with slow swirls in it, uneven in length, gathered into ragged clumps.
    -> (points (n, k, 3) in rest space, radius (n, k), surface uv (n, 2), per-strand attributes)"""
    from scipy.spatial import cKDTree
    import basemesh as bm
    V, F, N = b['V'], b['F'], b['N']; M = b['masks']; flow = b['flow']; rng = np.random.default_rng(seed)
    tris, tuv = [], []
    for fi, f in enumerate(F):
        if b['part'][fi] != 0: continue
        uv = b['UV'][fi]
        for a in range(1, len(f) - 1): tris.append((f[0], f[a], f[a + 1])); tuv.append((uv[0], uv[a], uv[a + 1]))
    tris = np.array(tris); tuv = np.array(tuv); p0, p1, p2 = V[tris[:, 0]], V[tris[:, 1]], V[tris[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(p1 - p0, p2 - p0), axis=1); dens = M['fur'][tris].mean(1)
    W = b['W']; bi = {n: i for i, n in enumerate(b['bones'])}; headw = W[:, bi['Head']]
    close = 1 + 2.2 * headw[tris].mean(1) + 1.0 * sum(W[:, i] for n, i in bi.items() if 'Hand' in n or 'ForeArm' in n)[tris].mean(1)      # finer, denser hair where the camera goes
    prob = area * dens * close; prob /= prob.sum(); ti = rng.choice(len(tris), size=count, p=prob)
    r1, r2 = rng.random(count), rng.random(count); sq = np.sqrt(r1); bary = np.stack([1 - sq, sq * (1 - r2), sq * r2], 1)
    at = lambda A: (A[tris[ti]] * (bary[:, :, None] if A.ndim == 2 else bary)).sum(1)
    root = at(V); rag = bm.noise3(root, 11.0, seed + 1); patch = np.clip((rag - 0.33) / 0.2, 0, 1); patch = patch * patch * (3 - 2 * patch)        # mangy patches where the coat is thin
    keep = at(M['fur']) * (0.30 + 0.70 * patch) > rng.random(count) * 0.62; ti, bary = ti[keep], bary[keep]; n_ = len(ti)
    root = at(V); n = at(N); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9; fl = at(flow); uv = (tuv[ti] * bary[:, :, None]).sum(1)
    L = at(M['length']) * rng.uniform(0.55, 1.18, n_) * (0.72 + 0.56 * bm.noise3(root, 6.0, seed + 2)); thick = 1 / np.sqrt(close[ti])
    ft = fl - (fl * n).sum(1, keepdims=True) * n; ft /= np.linalg.norm(ft, axis=1, keepdims=True) + 1e-9; side = np.cross(n, ft)
    swirl = (bm.noise3(root, 7.0, seed + 3) - 0.5) * 1.5 + rng.normal(0, 0.17, n_); ft = ft * np.cos(swirl)[:, None] + side * np.sin(swirl)[:, None]; side = np.cross(n, ft)
    soak = np.clip(wet * (0.75 + 0.5 * bm.noise3(root, 14.0, seed + 5)), 0, 1)                    # a soaked coat lies flat, sticks together in spikes and shines
    lift = (np.clip(at(M['lift']) + rng.normal(0, 0.09, n_), 0.10, 0.85) * (1 - 0.55 * soak))[:, None]; d0 = n * lift + ft * (1 - lift); d0 /= np.linalg.norm(d0, axis=1, keepdims=True)
    hang = at(M['hang'])[:, None]; bend = -n * 0.20 + np.array([0, 0, -0.22]) * hang
    frizz = (side * rng.normal(0, 1, (n_, 1)) + n * rng.normal(0, 0.5, (n_, 1))) * rng.uniform(0.03, 0.22, (n_, 1)) * (1 - 0.7 * soak[:, None])
    t = np.linspace(0, 1, k); pts = root[:, None, :] + L[:, None, None] * (t[None, :, None] * d0[:, None, :] + (t ** 2)[None, :, None] * (bend + frizz)[:, None, :])
    # clumps: every strand leans toward a nearby leader, more at the tip; small tight tufts inside big loose locks
    for ratio, mean, reach in ((14, 0.70, 2.2), (240, 0.26, 7.0)):
        lead = rng.choice(n_, size=max(1, n_ // ratio), replace=False); dist, j = cKDTree(root[lead]).query(root); Li = lead[j]
        cs = (np.clip(np.clip(rng.normal(mean, 0.2, len(lead)), 0.05, 0.97)[j] + soak * (0.26 if ratio < 100 else 0.5), 0, 0.985) * (dist < reach))[:, None, None] * (t[None, :] ** (1.2 - 0.5 * soak)[:, None])[:, :, None]
        target = pts[Li] + (root - root[Li])[:, None, :] * (1 - 0.88 * t)[None, :, None]; pts = pts * (1 - cs) + target * cs
    rad = (0.0105 * thick * (1 + 0.35 * soak))[:, None] * (1 - 0.82 * t ** 1.4)[None, :]
    grey = ((at(M['grey']) > rng.random(n_)) | (rng.random(n_) < 0.012)).astype(np.float32)
    return pts, rad, uv, dict(grey=grey, wet=soak.astype(np.float32), root=root.astype(np.float32))


def _fur_object(name, body, arm, pts, rad, uv, attrs, material):
    n, k, _ = pts.shape; cu = bpy.data.hair_curves.new(name); cu.add_curves([k] * n)
    cu.points.foreach_set('position', pts.reshape(-1).astype(np.float32)); cu.points.foreach_set('radius', rad.reshape(-1).astype(np.float32))
    at = cu.attributes.new('surface_uv_coordinate', 'FLOAT2', 'CURVE'); at.data.foreach_set('vector', uv.reshape(-1).astype(np.float32))
    for key, val in attrs.items():
        val = np.asarray(val, np.float32)
        if val.ndim == 2: cu.attributes.new(key, 'FLOAT_VECTOR', 'CURVE').data.foreach_set('vector', val.reshape(-1))
        else: cu.attributes.new(key, 'FLOAT', 'CURVE').data.foreach_set('value', val)
    cu.surface = body; cu.surface_uv_map = 'UVMap'; cu.materials.append(material)
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob); ob.parent = arm
    ng = bpy.data.node_groups.new('FurFollowsSkin', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry'); ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    i = ng.nodes.new('NodeGroupInput'); o = ng.nodes.new('NodeGroupOutput'); d = ng.nodes.new('GeometryNodeDeformCurvesOnSurface')
    ng.links.new(i.outputs[0], d.inputs[0]); ng.links.new(d.outputs[0], o.inputs[0])
    mod = ob.modifiers.new('Follow', 'NODES'); mod.node_group = ng
    return ob


# ------------------------------------------------------------------------------------------------ build
def build(fur=True, fur_count=450000, subdiv=2, paint_size=2048, wet=0.0):
    b = ape.build(); V, F = b['V'], b['F']
    me = bpy.data.meshes.new('SevenBody'); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    for p_ in me.polygons: p_.use_smooth = True
    layer = me.uv_layers.new(name='UVMap'); layer.data.foreach_set('uv', [c for f in b['UV'] for uv in f for c in uv])
    maps = skinpaint.paint(b, paint_size); huv = maps['uv']; loops = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', loops)
    me.uv_layers.new(name='HeadUV').data.foreach_set('uv', huv[loops].reshape(-1)); me.uv_layers['UVMap'].active = True; me.uv_layers['UVMap'].active_render = True
    attrs = dict(b['masks']); attrs['dev_u'] = b['dev_uv'][:, 0]; attrs['dev_v'] = b['dev_uv'][:, 1]; attrs['paint'] = maps['mask']
    for name, a in attrs.items(): me.attributes.new(name, 'FLOAT', 'POINT').data.foreach_set('value', np.asarray(a, dtype=np.float32))
    mats = dict(skin=skin_material(maps), teeth=simple('SevenTeeth', '#cbbf9c', 0.3, 0.2), tongue=simple('SevenTongue', '#7a3b3b', 0.35, 0.3), fur=fur_material())
    for key in ('skin', 'teeth', 'tongue'): me.materials.append(mats[key])
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
    # the device, and the light it throws: a small blue panel just above the screen, shining away from the arm
    dev, dmats = device_object(b, arm); mats['frame'], mats['glass'] = dmats
    ld = bpy.data.lights.new('DeviceGlow', 'AREA'); ld.shape = 'RECTANGLE'; ld.size = 2 * (device.A - device.FRAME); ld.size_y = 2 * (device.B - device.FRAME); ld.color = (0.20, 0.55, 1.0); ld.energy = 0.0; ld.spread = math.radians(150)
    glow = bpy.data.objects.new('DeviceGlow', ld); bpy.context.scene.collection.objects.link(glow); glow.parent = arm; glow.parent_type = 'BONE'; glow.parent_bone = 'LeftForeArm'
    fb = ad.bones['LeftForeArm']; c_rest = Vector(device.layout(b)['c']) + Vector((0, 0, 3.2)); rest = fb.matrix_local.inverted()
    glow.matrix_parent_inverse = Matrix.Identity(4); glow.location = (rest @ c_rest) - Vector((0, fb.length, 0)); glow.rotation_euler = (rest.to_3x3() @ Matrix.Rotation(math.pi, 3, 'X')).to_euler()   # an area light shines down its -Z: turn it to face +Z in rest space
    out = dict(arm=arm, body=body, data=b, mats=mats, fur=None, glow=glow, eyes=eyes(b, arm), device=dev); arm.scale = (SCALE, SCALE, SCALE)
    if fur:
        pts, rad, uv, fa = fur_strands(b, fur_count, wet=wet); out['fur'] = _fur_object('SevenFur', body, arm, pts, rad, uv, fa, mats['fur']); out['strands'] = len(pts)
    coll = bpy.data.collections.new('Seven'); bpy.context.scene.collection.children.link(coll); out['collection'] = coll               # everything that is him, for lamps that light only him
    for o in (arm, body, out['eyes'], dev, glow, out['fur']):
        if o is None: continue
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)
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
        if n in full:
            d, tw, face = _unpack(full[n])
            if n == 'Head' and face is None and abs(tw) < 1e-6: face = ((0, -1, 0), (0, -1, 0))      # unless told otherwise his face stays square to the front (the short neck bone would otherwise leave it turned a few degrees)
            aim(arm, n, d, tw, face)


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


def device_power(seven, value, frame=None, light=1.3, wave=None):
    """value: 0 = dead, 1 = awake (the display under the cracked glass, a dim glow in the lines under his skin, the light it casts).
    wave: how far (cm) a pulse of light has run out along those lines; None or a negative number = no pulse."""
    seven['glow'].data.energy = light * value
    for node in [seven['mats'][k].node_tree.nodes['DevicePower'] for k in ('skin', 'glass')]:
        node.outputs[0].default_value = value
        if frame is not None: node.outputs[0].keyframe_insert('default_value', frame=frame)
    wn = seven['mats']['skin'].node_tree.nodes['DeviceWave']; wn.outputs[0].default_value = -10.0 if wave is None else wave
    if frame is not None: seven['glow'].data.keyframe_insert('energy', frame=frame); wn.outputs[0].keyframe_insert('default_value', frame=frame)


def mud(level, wet=1.0, frame=None):
    """level: 0 = clean .. 1 = caked in swamp mud head to toe. wet: 1 = dripping .. 0 = dried pale. (One field for skin, fur and device.)"""
    g = mud_field()
    for name, v in (('MudLevel', level), ('MudWet', wet)):
        o = g.nodes[name].outputs[0]; o.default_value = v
        if frame is not None: o.keyframe_insert('default_value', frame=frame)


def face(seven, frame=None, **values):
    """Set face shapes, e.g. face(seven, Blink=1, JawOpen=0.3)."""
    kb = seven['body'].data.shape_keys.key_blocks
    for k, v in values.items():
        kb[k].value = v
        if frame is not None: kb[k].keyframe_insert('value', frame=frame)
