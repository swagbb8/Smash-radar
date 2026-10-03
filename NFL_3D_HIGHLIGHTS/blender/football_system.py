"""The football: a proper prolate ball with laces and stripes, flying on a ballistic arc with a tight spiral
(or tumbling end over end on kicks), tucked in the carrier's arm, or bouncing loose. Trajectories come from the
simulator (simulation.Sim.air uses throw position, target, flight time -> launch velocity under gravity)."""
import math
import bpy, bmesh
from mathutils import Vector, Quaternion, Matrix
from utils import YD, G, hex_linear


def ballistic(throw_position, target_position, flight_time, g=G):
    """Launch velocity (yards/s) that carries the ball from A to B in `flight_time` seconds under gravity."""
    return tuple((b - a) / flight_time for a, b in zip(throw_position[:2], target_position[:2])) + ((target_position[2] - throw_position[2] + 0.5 * g * flight_time ** 2) / flight_time,)


def throw_angle(v): return math.degrees(math.atan2(v[2], math.hypot(v[0], v[1])))


def build(coll, scale=1.0):
    bm = bmesh.new(); n, rings, L, R = 16, 15, 0.143 * scale, 0.086 * scale; vr = []
    for i in range(rings + 1):
        u = -1 + 2 * i / rings; r = R * max(0.0, 1 - abs(u) ** 2.15) ** 0.62 if abs(u) < 1 else 0.0
        vr.append([bm.verts.new((u * L, r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n))) for k in range(n)] if r > 1e-5 else [bm.verts.new((u * L, 0, 0))])
    for a, b in zip(vr, vr[1:]):
        if len(a) == 1 and len(b) == 1: continue
        for k in range(n):
            if len(a) == 1: f = bm.faces.new((a[0], b[(k + 1) % n], b[k]))
            elif len(b) == 1: f = bm.faces.new((a[k], a[(k + 1) % n], b[0]))
            else: f = bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
            x = f.calc_center_median().x / L; f.smooth = True; f.material_index = 1 if 0.56 < abs(x) < 0.7 else 0
    for i in range(8):                                             # laces
        x = (-0.42 + i * 0.12) * L; r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']: v.co = Vector((v.co.x * 0.012 * scale + x, v.co.y * 0.045 * scale, v.co.z * 0.008 * scale + R * 0.985))
        for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = 1
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r['verts']: v.co = Vector((v.co.x * 0.9 * L, v.co.y * 0.012 * scale, v.co.z * 0.008 * scale + R * 0.985))
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('Football'); bm.to_mesh(me); bm.free()
    leather = bpy.data.materials.new('leather'); leather.use_nodes = True; nt = leather.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = hex_linear('#6a3312'); p.inputs['Roughness'].default_value = 0.5
    tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 700; bn = nt.nodes.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = 0.25
    nt.links.new(tex.outputs['Fac'], bn.inputs['Height']); nt.links.new(bn.outputs['Normal'], p.inputs['Normal'])
    white = bpy.data.materials.new('ball_white'); white.use_nodes = True; white.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex_linear('#f4f4f4')
    me.materials.append(leather); me.materials.append(white)
    ob = bpy.data.objects.new('Football', me); coll.objects.link(ob); sub = ob.modifiers.new('Smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    ob.rotation_mode = 'QUATERNION'
    return ob


class BallAnimator:
    def __init__(self, ob): self.ob = ob; self.last_q = None

    def place(self, sim, ball, poses, frame, t):
        """ball = Recording.at(t)[1]; poses = {player: solved pose} for this frame."""
        pos, held, in_air, loose, vel, target = ball; ob = self.ob
        if held is not None and held in poses:
            po = poses[held]; carry = sim.act_of(held, 'carry') and not sim.act_of(held, 'celebrate'); down = sim.act_of(held, 'down')
            loc = po['hands']['tuck'] if carry else po['hands']['r']
            if down: loc = Vector((loc.x, loc.y, max(loc.z, 0.12)))
            yaw = po['yaw'] - math.pi / 2; q = Quaternion((0, 0, 1), yaw + (0.5 if carry else 0.0)) @ Quaternion((0, 1, 0), -0.35 if not carry else 0.15)
        else:
            loc = Vector((pos[0] * YD, pos[1] * YD, max(0.09, pos[2] * YD)))
            if in_air and (abs(vel[0]) + abs(vel[1]) + abs(vel[2])) > 1e-3:
                d = Vector(vel).normalized(); seg = next((s for s in sim.ball_segs if s['kind'] == 'air' and s['t0'] <= t <= s['t1']), None); spin = (seg or {}).get('spin', 30.0)
                if spin < 0: q = Quaternion((0, 0, 1), math.atan2(d.y, d.x)) @ Quaternion((0, 1, 0), spin * (t - seg['t0']))      # kick: end over end
                else: q = d.to_track_quat('X', 'Z') @ Quaternion((1, 0, 0), spin * t)                                              # pass: tight spiral, nose along the flight path
            elif loose: q = Quaternion((0.3, 1, 0.2), t * 9.0)
            else: q = Quaternion((0, 0, 1), 0.0)
        if self.last_q is not None and q.dot(self.last_q) < 0: q = -q
        self.last_q = q; ob.location = loc; ob.rotation_quaternion = q
        ob.keyframe_insert('location', frame=frame); ob.keyframe_insert('rotation_quaternion', frame=frame)
        return loc
