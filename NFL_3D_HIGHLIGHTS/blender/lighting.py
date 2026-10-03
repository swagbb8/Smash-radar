"""Stadium lighting rig + sky. Presets: DAY, NIGHT, PRIMETIME, CINEMATIC.

Each preset = sky gradient, a key (sun or the four light towers), field fill, a cool rim so players pop off the
background, and exposure. Lamps sit where stadium.py put the tower lamp banks.
"""
import math
import bpy
from mathutils import Vector
from utils import hex_linear

PRESETS = {
    #            sky top     horizon     sky W  sun W  sun colour  sun elev/azim  towers W   tower col   rim W  rim col    fill  exposure
    'DAY':       ('#2f6fd6', '#b9dcff', 1.00, 4.2, '#fff6e6', (58, 215),      0,         '#ffffff',  0.6,  '#cfe4ff', 0.0, 0.0),
    'NIGHT':     ('#01030a', '#0c1630', 0.10, 0.0, '#ffffff', (60, 200),      230000,    '#f3f6ff',  1.6,  '#8fb8ff', 0.5, 0.25),
    'PRIMETIME': ('#020714', '#132a55', 0.22, 0.0, '#ffffff', (60, 200),      300000,    '#fff2dc',  2.4,  '#7fb0ff', 0.8, 0.35),
    'CINEMATIC': ('#16264d', '#f0a060', 0.55, 3.0, '#ffb070', (14, 250),      120000,    '#ffe9c8',  2.0,  '#9cc0ff', 0.4, 0.2),
}


def _world(top, horizon, strength):
    w = bpy.data.worlds.new('StadiumSky'); w.use_nodes = True; nt = w.node_tree; bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = hex_linear(horizon); ramp.color_ramp.elements[1].position = 0.45; ramp.color_ramp.elements[1].color = hex_linear(top)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = strength
    return w


def _aim(ob, target): ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()


def build(coll, dims, preset='PRIMETIME'):
    """dims = stadium.build()['_dims']. Returns {'key': [...lamps], 'rim': lamp} so cameras can keep the rim behind the action."""
    top, hor, sky, sun_w, sun_c, (elev, azim), tower_w, tower_c, rim_w, rim_c, fill, exposure = PRESETS.get(preset, PRESETS['PRIMETIME'])
    sc = bpy.context.scene; sc.world = _world(top, hor, sky); out = {'key': [], 'preset': preset}
    def lamp(name, kind, loc, energy, color, **kw):
        d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = hex_linear(color)[:3]
        for k, v in kw.items(): setattr(d, k, v)
        ob = bpy.data.objects.new(name, d); ob.location = loc; coll.objects.link(ob); return ob
    if sun_w > 0:
        s = lamp('Sun', 'SUN', (0, 0, 60), sun_w, sun_c, angle=math.radians(1.2)); e, a = math.radians(elev), math.radians(azim)
        s.rotation_euler = (math.pi / 2 - e, 0, a); out['key'].append(s)
    if tower_w > 0:
        a, b = dims['a'] + 34, dims['b'] + 30
        for sx in (-1, 1):
            for sy in (-1, 1):
                l = lamp(f'Tower_{sx}_{sy}', 'SPOT', (sx * a, sy * b, 57), tower_w, tower_c, spot_size=math.radians(74), spot_blend=0.5, shadow_soft_size=5.5)
                _aim(l, (sx * -8, sy * -4, 0)); out['key'].append(l)
    if fill > 0:
        f = lamp('FieldFill', 'AREA', (0, 0, 55), 26000 * fill, '#dfe9ff', size=90); f.data.shape = 'RECTANGLE'; f.data.size_y = 50
    # a cool rim / kicker from behind the far sideline: separates players from the crowd
    r = lamp('Rim', 'SUN', (0, 0, 40), rim_w, rim_c, angle=math.radians(3)); r.rotation_euler = (math.radians(68), 0, math.radians(20)); out['rim'] = r
    sc.view_settings.exposure = exposure
    try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        try: sc.view_settings.view_transform = 'Filmic'
        except Exception: pass
    return out
