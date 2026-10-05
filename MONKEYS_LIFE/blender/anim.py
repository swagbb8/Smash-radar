"""Seven's performance: key poses blended over time, plus the small involuntary motion that makes a body look alive
(breathing, trembling arms, a head that is never quite still, blinks, eyes that jump from thing to thing).

    actor = Actor(seven)
    a = actor.key('prone', root=(0, 0), heading=0, sink=-0.07)       # a pose from poses.py, where he is, how deep in the mud
    track = Track([(0.0, a), (3.5, b, 'inout'), ...])
    actor.apply(track.at(t)); actor.alive(t, ...); actor.gaze(point)     # every frame

Poses are stored as bone rotations (read back after pointing the bones), so blending never passes through broken shapes.
"""
import math
import bpy
import numpy as np
from mathutils import Quaternion, Vector
import seven as S
import poses

GROUPS = {'spine': ('Hips', 'Spine', 'Spine1', 'Spine2'), 'head': ('Neck', 'Head'), 'armL': ('LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'), 'armR': ('RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'),
          'legL': ('LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'), 'legR': ('RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase')}
LAG = {'spine': 0.0, 'head': 0.14, 'armL': 0.05, 'armR': 0.08, 'legL': 0.0, 'legR': 0.03, 'fingers': 0.12}      # how late each part starts a move (fraction of the move): nothing in a body moves all at once


def ease(x, kind='inout'):
    x = min(1.0, max(0.0, x))
    if kind == 'linear': return x
    if kind == 'in': return x * x
    if kind == 'out': return 1 - (1 - x) ** 2
    if kind == 'settle': return 1 - (1 - x) ** 3                      # arrives fast, settles slowly
    return x * x * (3 - 2 * x)


def wobble(t, seed=0.0, speed=1.0):
    """Smooth, never-repeating noise in -1..1 (a few sines that do not line up)."""
    t = t * speed + seed * 17.3
    return (math.sin(t * 1.0 + seed) + 0.6 * math.sin(t * 2.31 + 1.7 * seed + 0.5) + 0.35 * math.sin(t * 4.73 + 2.9 * seed + 1.1)) / 1.95


class Actor:
    def __init__(self, sv):
        self.sv = sv; self.arm = sv['arm']; self.names = [b.name for b in self.arm.pose.bones]
        for pb in self.arm.pose.bones: pb.rotation_mode = 'QUATERNION'
        self.group = {}
        for g, bones in GROUPS.items():
            for b in bones: self.group[b] = g
        for n in self.names:
            if 'Hand' in n and n not in self.group: self.group[n] = 'fingers'
        self.rest_curl = {}

    # ---------------------------------------------------------------- keys
    def reset(self):
        for pb in self.arm.pose.bones: pb.rotation_quaternion = Quaternion()
        self.arm.rotation_euler = (0, 0, 0); bpy.context.view_layer.update()

    def key(self, pose, root=(0.0, 0.0), heading=0.0, sink=0.0, z=None, curl=None, lcurl=None, rcurl=None, tweak=None):
        """A key pose. pose = a name in poses.POSES or a spec dict. root = (x, y) of the rig's origin in the world (metres),
        heading = turn about Z (radians; 0 = facing -Y), sink = where his lowest point rests (z; negative = in the mud), or give z outright.
        curl = (j1, j2, j3) finger curl for both hands, lcurl / rcurl for one. tweak = {bone: direction spec} laid over the pose."""
        self.reset(); spec = dict(poses.POSES[pose] if isinstance(pose, str) else pose)
        if tweak: spec.update(tweak)
        S.pose(self.sv, spec); c = curl or (poses.CURL.get(pose) if isinstance(pose, str) else None) or (0.3, 0.4, 0.3)
        for side, cc in (('Left', lcurl or c), ('Right', rcurl or c)):
            for f in ('Index', 'Middle', 'Ring', 'Pinky'):
                for j, a in enumerate(cc, 1):
                    pb = self.arm.pose.bones[f'{side}Hand{f}{j}']; pb.rotation_quaternion = Quaternion(poses._curl_axis(self.arm, pb), a)
        self.arm.location = (root[0], root[1], 0.0); self.arm.rotation_euler = (0, 0, heading); bpy.context.view_layer.update()
        if z is None: S.ground(self.sv, sink); z = self.arm.location.z
        q = {pb.name: pb.rotation_quaternion.copy() for pb in self.arm.pose.bones}
        return dict(q=q, loc=Vector((root[0], root[1], z)), heading=heading)

    def apply(self, k):
        for n, q in k['q'].items(): self.arm.pose.bones[n].rotation_quaternion = q
        self.arm.location = k['loc']; self.arm.rotation_euler = (0, 0, k['heading'])

    # ---------------------------------------------------------------- life
    def alive(self, t, breath=1.0, rate=0.30, tremble=None, restless=1.0):
        """Layer involuntary motion over whatever pose is applied. breath = depth (1 = resting), rate = breaths per second,
        tremble = {group or bone: degrees} of muscle shake, restless = how much the head and spine drift."""
        pb = self.arm.pose.bones; ph = 2 * math.pi * rate * t; b = math.radians(1.1) * breath * math.sin(ph); b2 = math.radians(0.6) * breath * math.sin(ph - 0.6)
        def add(name, axis, ang):
            p = pb[name]; ax = p.bone.matrix_local.to_3x3().inverted() @ Vector(axis); p.rotation_quaternion = p.rotation_quaternion @ Quaternion(ax.normalized(), ang)
        add('Spine1', (1, 0, 0), b * 0.6); add('Spine2', (1, 0, 0), b); add('Neck', (1, 0, 0), -b * 0.7); add('LeftShoulder', (0, 1, 0), -b2); add('RightShoulder', (0, 1, 0), b2)
        r = math.radians(restless)
        add('Head', (0, 0, 1), r * 1.2 * wobble(t, 1.0, 0.7)); add('Head', (1, 0, 0), r * 0.8 * wobble(t, 2.0, 0.55)); add('Neck', (0, 1, 0), r * 0.5 * wobble(t, 3.0, 0.4)); add('Spine', (0, 1, 0), r * 0.35 * wobble(t, 4.0, 0.3))
        for key, deg in (tremble or {}).items():
            for i, n in enumerate(GROUPS.get(key, (key,))):
                a = math.radians(deg); add(n, (1, 0, 0), a * wobble(t, 10 + i, 21.0) * 0.6); add(n, (0, 1, 0), a * wobble(t, 20 + i, 17.0) * 0.6)

    def gaze(self, point):
        bpy.context.view_layer.update(); S.look_at(self.sv, point)

    def gaze_dir(self, yaw, pitch):
        """Look relative to where the head points: yaw to his left (+) / right, pitch up (+) / down, in degrees."""
        bpy.context.view_layer.update(); M = self.arm.matrix_world; head = self.arm.pose.bones['Head']; eye = M @ ((self.arm.pose.bones['LeftEye'].head + self.arm.pose.bones['RightEye'].head) / 2)
        R = (M.to_3x3() @ head.matrix.to_3x3() @ head.bone.matrix_local.to_3x3().inverted())                       # rig rest directions -> world, for the head as posed
        y, p = math.radians(yaw), math.radians(pitch); d = R @ Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
        S.look_at(self.sv, tuple(eye + d * 3.0))

    def face(self, **v): S.face(self.sv, **v)


class Track:
    """Key poses on a time line. keys: [(time, key), (time, key, ease), (time, key, ease, {group: lag override})]"""

    def __init__(self, keys, actor):
        self.keys = [(k[0], k[1], k[2] if len(k) > 2 else 'inout', k[3] if len(k) > 3 else {}) for k in keys]; self.actor = actor

    def at(self, t):
        K = self.keys
        if t <= K[0][0]: return K[0][1]
        if t >= K[-1][0]: return K[-1][1]
        i = max(j for j in range(len(K) - 1) if K[j][0] <= t); t0, a, _, _ = K[i]; t1, b, kind, lag = K[i + 1]; D = t1 - t0; u = (t - t0) / D; q = {}
        for n in a['q']:
            g = self.actor.group.get(n, 'spine'); l = lag.get(g, LAG.get(g, 0.0)); w = ease((u - l) / max(1e-6, 1 - l), kind) if l >= 0 else ease(u / max(1e-6, 1 + l), kind)
            q[n] = a['q'][n].slerp(b['q'][n], w)
        w = ease(u, kind); dh = (b['heading'] - a['heading'] + math.pi) % (2 * math.pi) - math.pi
        return dict(q=q, loc=a['loc'].lerp(b['loc'], w), heading=a['heading'] + dh * w)


def blinks(t, times, close=0.07, hold=0.04, open_=0.16):
    """Blink amount 0..1 at time t for blinks starting at the given times."""
    v = 0.0
    for b in times:
        x = t - b
        if 0 <= x < close: v = max(v, ease(x / close, 'in'))
        elif close <= x < close + hold: v = 1.0
        elif close + hold <= x < close + hold + open_: v = max(v, 1 - ease((x - close - hold) / open_, 'out'))
    return v


def curve(t, pts, kind='inout'):
    """A value keyed over time: pts = [(time, value), ...]."""
    if t <= pts[0][0]: return pts[0][1]
    if t >= pts[-1][0]: return pts[-1][1]
    i = max(j for j in range(len(pts) - 1) if pts[j][0] <= t); (t0, a), (t1, b) = pts[i], pts[i + 1]; return a + (b - a) * ease((t - t0) / (t1 - t0), kind)


def saccades(t, pts, move=0.07):
    """Eyes do not glide, they jump. pts = [(time, (yaw, pitch)), ...] -> (yaw, pitch) with a quick hop to each new target."""
    cur = pts[0][1]
    for i in range(1, len(pts)):
        ti, tgt = pts[i]
        if t >= ti + move: cur = tgt
        elif t >= ti: w = ease((t - ti) / move, 'out'); return (cur[0] + (tgt[0] - cur[0]) * w, cur[1] + (tgt[1] - cur[1]) * w)
    return cur
