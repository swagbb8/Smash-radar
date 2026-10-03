"""Animation system: turns each simulated player state into a full-body pose.

Locomotion (idle / walk / run, forwards or backpedalling) is blended from the motion-capture clips that ship in
assets/animations (any Mixamo-rig .glb dropped there is picked up automatically). Football actions — stance, block,
throw, catch, one-hand catch, jump, dive, tackle, fall, stiff arm, spin, hurdle, kick, handoff, celebrate — are
procedural: limbs are aimed at target directions with a small FK solver, blended in and out by the play timeline.

Directions are in the player's own frame (armature space): +X = his left, -Y = forward, +Z = up.
"""
import math
import bpy
from mathutils import Vector, Quaternion
from utils import clamp, lerp, smooth, YD

PRE = 'mixamorig:'
CHAIN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
AIM_CHILD = {'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand', 'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'RightUpLeg': 'RightLeg',
             'RightLeg': 'RightFoot', 'LeftFoot': 'LeftToeBase', 'RightFoot': 'RightToeBase'}
X, Yv, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
SAMPLES = 24


class Rig:
    """Rest-pose data + sampled locomotion clips, shared by every player."""

    def __init__(self, base):
        arm = base['arm']; bones = arm.data.bones
        self.rest = {n: bones[PRE + n].matrix_local.to_quaternion() for n in CHAIN}
        self.head = {n: bones[PRE + n].head_local.copy() for n in CHAIN}
        self.parent = {n: (bones[PRE + n].parent.name.replace(PRE, '') if bones[PRE + n].parent else None) for n in CHAIN}
        self.rest_local = {n: (self.rest[self.parent[n]].inverted() @ self.rest[n]) if self.parent[n] else self.rest[n].copy() for n in CHAIN}
        self.aim = {n: (self.head[c] - self.head[n]).normalized() for n, c in AIM_CHILD.items()}
        self.clips = {}
        sc = bpy.context.scene; arm.animation_data_create(); keep = sc.frame_current
        for name, act in base['actions'].items():
            if name not in ('idle', 'walk', 'run'): continue
            arm.animation_data.action = act
            if hasattr(act, 'slots') and len(act.slots): arm.animation_data.action_slot = act.slots[0]
            f0, f1 = act.frame_range; q = {n: [] for n in CHAIN}; hip = []
            for k in range(SAMPLES):
                f = f0 + (f1 - f0) * k / SAMPLES; sc.frame_set(int(f), subframe=f - int(f))
                for n in CHAIN: q[n].append(arm.pose.bones[PRE + n].rotation_quaternion.copy())
                hip.append(arm.pose.bones[PRE + 'Hips'].location.copy())
            self.clips[name] = {'q': q, 'hip': hip, 'dur': (f1 - f0) / sc.render.fps}
        arm.animation_data_clear(); sc.frame_set(keep)
        for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
        if not {'idle', 'run'} <= set(self.clips): raise RuntimeError('the animation asset needs at least "idle" and "run" clips')
        self.clips.setdefault('walk', self.clips['run'])

    def sample(self, clip, phase):
        c = self.clips[clip]; x = (phase % 1.0) * SAMPLES; i = int(x) % SAMPLES; j = (i + 1) % SAMPLES; k = x - int(x)
        return {n: c['q'][n][i].slerp(c['q'][n][j], k) for n in CHAIN}, c['hip'][i].lerp(c['hip'][j], k)


def _blend(parts):
    """Weighted blend of [(weight, {bone: quat}, hip)] (normalised lerp, hemisphere-aligned)."""
    parts = [p for p in parts if p[0] > 1e-4]; tot = sum(p[0] for p in parts); ref = parts[0][1]; out = {}
    for n in CHAIN:
        acc = [0.0, 0.0, 0.0, 0.0]
        for w, q, _ in parts:
            v = q[n]; s = w / tot * (-1 if v.dot(ref[n]) < 0 else 1)
            acc[0] += v.w * s; acc[1] += v.x * s; acc[2] += v.y * s; acc[3] += v.z * s
        out[n] = Quaternion(acc).normalized()
    hip = Vector((0, 0, 0))
    for w, _, h in parts: hip += h * (w / tot)
    return out, hip


class Recording:
    """The whole play sampled at 120 Hz: every player's position / facing / speed / stride phase and the ball.
    Output frames (normal speed, slow motion, replays) are then free to ask for any moment, in any order."""
    HZ = 120

    def __init__(self, sim):
        self.sim = sim; n = int(sim.duration * self.HZ) + 2; self.n = n; sim.reset()
        cyc = [(p.id * 0.37) % 1.0 for p in sim.players]; prev = [(p.x, p.y) for p in sim.players]; self.frames = []; self.ball = []
        for k in range(n):
            sim.seek(k / self.HZ); row = []
            for i, p in enumerate(sim.players):
                dx, dy = p.x - prev[i][0], p.y - prev[i][1]; prev[i] = (p.x, p.y)
                back = -1 if (dx * math.cos(p.face) + dy * math.sin(p.face)) < -1e-4 else 1
                cyc[i] = (cyc[i] + 1 + back * math.hypot(dx, dy) / (4.7 if p.speed > 4.2 else 2.3)) % 1.0
                row.append((p.x, p.y, p.z, p.face, p.speed, cyc[i], back))
            b = sim.ball; self.frames.append(row); self.ball.append((tuple(b['pos']), b['held'], b['in_air'], b['loose'], tuple(b['vel']), b['target']))
        self.events = list(sim.events)                              # includes the dive-and-miss events found while stepping

    def at(self, t):
        """Interpolated state at time t -> ([(x, y, z, face, speed, cycle, back)...], ball tuple). Also sets sim.t for act lookups."""
        x = clamp(t * self.HZ, 0, self.n - 1.001); i = int(x); k = x - i; a, b = self.frames[i], self.frames[i + 1]; out = []
        for u, v in zip(a, b):
            dc = ((v[5] - u[5] + 0.5) % 1.0) - 0.5
            out.append((lerp(u[0], v[0], k), lerp(u[1], v[1], k), lerp(u[2], v[2], k), lerp(u[3], v[3], k), lerp(u[4], v[4], k), (u[5] + dc * k) % 1.0, u[6]))
        ba, bb = self.ball[i], self.ball[i + 1]
        pos = tuple(lerp(p, q, k) for p, q in zip(ba[0], bb[0])) if ba[1] is bb[1] else ba[0]
        self.sim.t = t
        return out, (pos, ba[1], ba[2], ba[3], ba[4], ba[5])


class PlayerAnimator:
    """Solves one player's pose for any recorded moment (pure function of the play timeline)."""

    def __init__(self, rig, seed=0): self.rig = rig

    def pose(self, sim, p, state):
        """state = (x, y, z, face, speed, cycle, back) from Recording.at(t), with sim.t already set.
        -> dict(basis={bone: quat}, hip_loc, loc (metres), yaw, pitch, hands, head)."""
        rig = self.rig; t = sim.t; px, py, pz, face, v, cycle, back = state
        run = clamp((v - 2.4) / 3); walk = clamp(v / 1.6) * (1 - run)
        base, hip = _blend([(run, *rig.sample('run', cycle)), (walk, *rig.sample('walk', cycle)), (max(0.0, 1 - run - walk), *rig.sample('idle', (t * 0.28 + p.id * 0.137)))])
        A = lambda typ: sim.act_of(p, typ)
        io = lambda a, k=0.14: smooth(clamp(min(a['el'] / k, (min(a['t1'], 1e4) - t) / k))) if a else 0.0
        ov = {n: [] for n in CHAIN}                         # per-bone overlays applied during the FK pass
        aim = lambda n, d, w: ov[n].append(('aim', Vector(d).normalized(), clamp(w))) if w > 1e-3 else None
        rot = lambda n, axis, ang: ov[n].append(('rot', axis, ang)) if abs(ang) > 1e-4 else None
        # ---- whole-body pitch / lift: dives, falls, lying on the turf
        pitch = run * 0.10 * (1 if back > 0 else -0.5); lift = 0.0
        dive, fall, down, cel, kneel = A('dive'), A('fall'), A('down'), A('celebrate'), A('kneel')
        if dive: pitch = lerp(pitch, 1.38, smooth(clamp(dive['ph'] * 1.6))); lift = math.sin(math.pi * clamp(dive['ph'])) * 0.45
        if fall: pitch = lerp(pitch, -1.45 if fall.get('back') else 1.45, smooth(fall['ph'])); lift = math.sin(math.pi * fall['ph']) * 0.2
        if down:                                                # lying the way he went down
            last = max((a for a in p.acts + p.auto if a['type'] in ('fall', 'dive') and a['t0'] <= t), key=lambda a: a['t0'], default=None)
            pitch = -1.45 if (last and last['type'] == 'fall' and last.get('back')) else 1.45
            if down['t1'] < 90: pitch = lerp(pitch, 0.0, smooth(clamp((t - (down['t1'] - 0.5)) / 0.5)))
        prone = clamp(abs(pitch) / 1.4)
        # ---- crouches: lineman 3-point stance, ready stance, blocking base, scooping, the holder's knee
        stance = io(A('stance')) * (1 - run)
        c = max(stance, io(A('ready')) * 0.3, io(A('block'), 0.2) * 0.32, io(A('scoop'), 0.12) * 1.0, 1.0 if kneel else 0.0) * (1 - run * 0.8)
        hip_drop = 0.0
        if c > 0:
            deep = 1.0 if kneel else 0.0
            thigh = Vector((0.2, -0.72 - 0.15 * deep, -0.67 + 0.3 * deep)).normalized(); shin = Vector((0.0, 0.36 + 0.3 * deep, -0.93)).normalized()
            for s, side in ((1, 'Left'), (-1, 'Right')):
                aim(side + 'UpLeg', (s * thigh.x, thigh.y, thigh.z), c); aim(side + 'Leg', shin, c); aim(side + 'Foot', (0, -0.78, -0.62), c)
            hip_drop = c * (17.5 + 17 * deep); rot('Hips', X, 0.22 * c); rot('Spine', X, (0.5 + 0.45 * stance) * c * 0.5); rot('Spine1', X, (0.5 + 0.45 * stance) * c * 0.5); rot('Neck', X, -0.35 * c); rot('Head', X, -0.55 * c)
            if stance > 0: aim('RightArm', (-0.12, -0.5, -0.86), stance); aim('RightForeArm', (0.0, -0.25, -0.97), stance); aim('LeftArm', (0.25, -0.2, -0.9), stance * 0.7); aim('LeftForeArm', (-0.2, -0.75, -0.3), stance * 0.7)
        # ---- arms
        fwd = max(io(A('block'), 0.2), io(A('handoff')), 1.0 if dive else 0.0, io(A('scoop')))
        if fwd:
            for s, side in ((1, 'Left'), (-1, 'Right')): aim(side + 'Arm', (s * 0.32, -0.9, 0.12 if not dive else 0.5), fwd); aim(side + 'ForeArm', (-s * 0.12, -0.92, 0.36 if not dive else 0.3), fwd)
        ct, c1, jmp, reach = A('catch'), A('catch1'), A('jump'), A('reach')
        if ct:
            w = io(ct, 0.12); hi = 0.85 if ct.get('high') else 0.45
            if ct.get('over'):                                  # over the shoulder: arms out in front, looking back for the ball
                for s, side in ((1, 'Left'), (-1, 'Right')): aim(side + 'Arm', (s * 0.3, -0.85, 0.25), w); aim(side + 'ForeArm', (-s * 0.25, -0.75, 0.6), w)
                rot('Head', Z, 0.9 * w); rot('Head', X, -0.35 * w)
            else:
                for s, side in ((1, 'Left'), (-1, 'Right')): aim(side + 'Arm', (s * 0.38, -0.8, hi), w); aim(side + 'ForeArm', (-s * 0.1, -0.55, 0.85), w)
                rot('Head', X, -0.25 * w)
        if c1: w = io(c1, 0.12); aim('RightArm', (-0.3, -0.25, 0.95), w); aim('RightForeArm', (-0.05, -0.2, 1.0), w); aim('LeftArm', (0.7, -0.2, -0.6), w); rot('Spine2', Yv, 0.22 * w); rot('Head', X, -0.4 * w)
        if (jmp and not ct and not c1) or reach:
            w = math.sin(math.pi * jmp['ph']) if (jmp and not reach) else io(reach)
            if not A('hurdle'):
                for s, side in ((1, 'Left'), (-1, 'Right')): aim(side + 'Arm', (s * 0.3, -0.25, 0.95), w); aim(side + 'ForeArm', (s * 0.1, -0.1, 1.0), w)
        th = A('throw')
        if th:
            k = smooth(clamp((th['ph'] - 0.45) / 0.3)); w = io(th, 0.15)
            ua = Vector((-0.7, 0.45, 0.55)).lerp(Vector((-0.3, -0.85, 0.42)), k); fa = Vector((-0.1, 0.55, 0.85)).lerp(Vector((-0.05, -0.97, 0.22)), k)
            aim('RightArm', ua, w); aim('RightForeArm', fa, w); aim('LeftArm', Vector((0.35, -0.85, 0.35)).lerp(Vector((0.6, 0.1, -0.75)), k), w); aim('LeftForeArm', Vector((0.0, -0.9, 0.4)).lerp(Vector((0.2, -0.5, -0.8)), k), w)
            rot('Spine1', Z, lerp(-0.5, 0.45, k) * w); rot('Spine2', Z, lerp(-0.3, 0.3, k) * w)
        if A('carry') and not cel and not fall and not down:
            aim('LeftArm', (0.35, -0.25, -0.9), 1.0); aim('LeftForeArm', (-0.55, -0.8, 0.22), 1.0)
        st = A('stiff')
        if st: w = io(st, 0.1); s = st.get('side', 1); n = 'Left' if s > 0 else 'Right'; n = 'Right' if A('carry') else n; aim(n + 'Arm', ((-1 if n == 'Right' else 1) * 0.75, -0.62, 0.2), w); aim(n + 'ForeArm', ((-1 if n == 'Right' else 1) * 0.72, -0.68, 0.12), w)
        sp = A('spin'); spin = 2 * math.pi * (sum(1 for a in p.acts if a['type'] == 'spin' and a['t1'] <= t) + (smooth(sp['ph']) if sp else 0.0))
        if sp: w = io(sp, 0.1); rot('Spine', X, 0.25 * w); aim('RightArm', (-0.5, -0.3, -0.8), w)
        hd = A('hurdle')
        if hd:
            w = math.sin(math.pi * hd['ph']); aim('RightUpLeg', (-0.1, -0.95, 0.25), w); aim('RightLeg', (0.0, -0.8, -0.6), w); aim('LeftUpLeg', (0.15, 0.55, -0.82), w); aim('LeftLeg', (0.0, 0.95, -0.25), w); rot('Spine', X, 0.3 * w)
        sm = A('stumble')
        if sm: w = math.sin(math.pi * sm['ph']); rot('Hips', X, 0.5 * w); rot('Spine1', X, 0.35 * w); aim('RightArm', (-0.6, -0.6, -0.5), w)
        kick = A('kick')
        if kick:
            k = smooth(clamp((kick['ph'] - 0.3) / 0.25)); w = io(kick, 0.1)
            aim('RightUpLeg', Vector((-0.05, 0.55, -0.83)).lerp(Vector((-0.05, -0.9, 0.42)), k), w); aim('RightLeg', Vector((0, 0.85, -0.5)).lerp(Vector((0, -0.95, 0.3)), k), w)
            rot('Spine', X, lerp(0.15, -0.2, k) * w); aim('LeftArm', (0.85, -0.2, 0.3), w); aim('RightArm', (-0.6, 0.5, -0.4), w)
        if cel:
            e = cel['el']; s_ = cel.get('style', 0); w = smooth(clamp(e / 0.25))
            if s_ in (0, 1):
                for s, side in ((1, 'Left'), (-1, 'Right')): aim(side + 'Arm', (s * 0.4, -0.1, 0.92), w); aim(side + 'ForeArm', (s * 0.15, -0.05, 1.0), w)
                lift += abs(math.sin(e * (5.2 if s_ == 0 else 4.0) + p.id)) * (0.32 if s_ == 0 else 0.16); rot('Head', X, -0.25 * w)
            elif s_ == 2:
                pump = math.sin(e * 9) * 0.5; aim('RightArm', (-0.45, -0.6, 0.2 + pump * 0.5), w); aim('RightForeArm', (-0.1, -0.35, 0.95), w); rot('Spine', X, 0.15 * w)
            else: aim('RightArm', (-0.25, -0.9, 0.35), w); aim('RightForeArm', (-0.2, -0.95, 0.3), w); aim('LeftArm', (0.45, 0.1, -0.88), w)
        if prone > 0.2 and not cel:
            for s, side in ((1, 'Left'), (-1, 'Right')): aim(side + 'UpLeg', (s * 0.2, 0.1, -1.0), prone * 0.8); aim(side + 'Leg', (0, 0.25, -1.0), prone * 0.8)
        rot('Hips', X, pitch * 0.0)
        # ---- FK pass: animated base, then overlays, then back to local (basis) rotations
        W = {}; basis = {}; pos = {}
        for n in CHAIN:
            par = rig.parent[n]; w0 = (W[par] @ rig.rest_local[n] if par else rig.rest[n].copy()) @ base[n]
            for kind, a, b in ov[n]:
                if kind == 'rot': w0 = Quaternion(a, b) @ w0
                else:
                    cur = (w0 @ rig.rest[n].inverted()) @ rig.aim[n]; q = cur.rotation_difference(a); w0 = Quaternion().slerp(q, b) @ w0
            W[n] = w0; basis[n] = ((W[par] @ rig.rest_local[n]) if par else rig.rest[n]).inverted() @ w0
        hip_arm = rig.rest['Hips'] @ hip + Vector((0, 0, -hip_drop))               # armature-space hip offset (cm)
        hip_loc = rig.rest['Hips'].inverted() @ hip_arm
        pos['Hips'] = rig.head['Hips'] + hip_arm
        for n in CHAIN[1:]:
            par = rig.parent[n]; pos[n] = pos[par] + (W[par] @ rig.rest[par].inverted()) @ (rig.head[n] - rig.head[par])
        # keep the lowest foot on the turf (clips + crouch can float or sink the body a little)
        foot = min(pos['LeftToeBase'].z, pos['RightToeBase'].z, pos['LeftFoot'].z - 6, pos['RightFoot'].z - 6)
        ground = clamp(1 - prone * 1.5) * (1 - clamp(pz * 4)) * (0 if (hd or kick) else 1)
        fix = (0.0 - foot) * ground if c > 0 or run < 0.3 else 0.0
        hip_loc = rig.rest['Hips'].inverted() @ (hip_arm + Vector((0, 0, fix)))
        scale = p_scale(p); yaw = face + math.pi / 2 + spin
        loc = Vector((px * YD, py * YD, (pz + lift) * YD + prone * 0.16))
        def world(v):                                                               # armature cm -> world metres
            q = Vector((v.x * scale[0], v.y * scale[0], (v.z + fix) * scale[1])) * 0.01
            cp, sp_ = math.cos(pitch), math.sin(pitch); q = Vector((q.x, q.y * cp - q.z * sp_, q.y * sp_ + q.z * cp))
            cy, sy = math.cos(yaw), math.sin(yaw); return Vector((q.x * cy - q.y * sy, q.x * sy + q.y * cy, q.z)) + loc
        fore = lambda side: pos[side + 'Hand'] + (W[side + 'ForeArm'] @ rig.rest[side + 'ForeArm'].inverted()) @ rig.aim[side + 'ForeArm'] * 9.0
        return {'basis': basis, 'hip_loc': hip_loc, 'loc': loc, 'yaw': yaw, 'pitch': pitch,
                'hands': {'r': world(fore('Right')), 'l': world(fore('Left')), 'tuck': world(pos['LeftForeArm'].lerp(pos['LeftHand'], 0.55) + Vector((-6, -7, 2)))}, 'head': world(pos['Head'] + Vector((0, 0, 10)))}


_SCALE = {}


def p_scale(p): return _SCALE.get(p.id, (1.04, 1.04))
def set_scale(pid, lateral, height): _SCALE[pid] = (lateral, height)


def apply(player, pose, frame):
    """Write one frame of a solved pose onto a spawned player and keyframe it."""
    arm = player['arm']; arm.location = pose['loc']; arm.rotation_euler = (pose['pitch'], 0.0, pose['yaw'])
    arm.keyframe_insert('location', frame=frame); arm.keyframe_insert('rotation_euler', frame=frame)
    pbs = player.setdefault('_pb', {n: arm.pose.bones[PRE + n] for n in CHAIN})
    last = player.setdefault('_q', {})
    for n, q in pose['basis'].items():
        if n in last and q.dot(last[n]) < 0: q = -q                 # keep quaternions on one hemisphere so motion blur interpolates the short way
        last[n] = q; pb = pbs[n]; pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=frame)
    hp = pbs['Hips']; hp.location = pose['hip_loc']; hp.keyframe_insert('location', frame=frame)
