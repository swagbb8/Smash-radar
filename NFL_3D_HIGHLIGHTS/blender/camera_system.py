"""Automatic sports cinematography.

direct()      : play events -> shot list (wide -> behind-QB -> ball tracking -> slow-mo catch -> receiver tracking ->
                end-zone -> celebration close-up), plus slow-motion windows.
CameraRig     : flies one Blender camera through those shots: smooth tracking, dolly, orbit, controlled zoom,
                subtle handheld movement, focus tracking with depth of field, dramatic low angles.
Ten camera types: wide, qb, behind_qb, ball, receiver/track, sideline, endzone, low, closeup/celebrate, replay.
All positions are computed in yards (field space) and converted to metres when written to the camera.
"""
import math
try:
    import bpy
    from mathutils import Vector
except ImportError:                 # direct() / rate_at() are pure Python: timelines can be planned without Blender
    bpy = None
from utils import clamp, lerp, smooth, YD

STYLES = ('cinematic', 'broadcast', 'behind', 'sideline', 'endzone')


def direct(sim, events, style='cinematic', fx=1.0):
    """-> {'shots': [{t0, t1, type, ...}], 'warp': [{a, b, rate}]} in play time."""
    ev = lambda typ: next((e for e in events if e['type'] == typ), None); S, end, F = sim.S, sim.duration, sim.focus
    shots, warp = [], []
    def add(t0, typ, **o):
        if shots and t0 <= shots[-1]['t0'] + 0.3: shots[-1].update(type=typ, **o); return
        shots.append(dict(t0=max(0.0, t0), type=typ, **o))
    def slow(a, b, rate):
        if fx > 0: warp.append(dict(a=a, b=b, rate=rate))
    score = ev('td') or ev('two_pt') or ev('fg_good'); tk, ct, it, th, ho, fu, rc, kick, sack, inc = (ev(k) for k in ('tackle', 'catch', 'int', 'throw', 'handoff', 'fumble', 'recover', 'kick', 'sack', 'incomplete'))
    moves = [e for e in events if e['type'] == 'move']
    if style != 'cinematic':
        add(0, {'broadcast': 'wide', 'behind': 'chase', 'sideline': 'sideline', 'endzone': 'endzone'}.get(style, 'wide'), soft=True)
        if score: add(score['t'] + 0.9, 'celebrate')
    elif kick:
        thru = ev('fg_good') or ev('fg_miss'); add(0, 'kick_behind'); add(kick['t'] + 0.12, 'ball'); add(thru['t'] - 0.55, 'posts'); slow(thru['t'] - 0.2, thru['t'] + 0.15, 0.4)
        add(thru['t'] + 1.0, 'celebrate' if score else 'wide')
    elif sim.no_scrimmage:
        add(0, 'sky'); add(ct['t'] + 0.5, 'track'); slow(ct['t'] - 0.15, ct['t'] + 0.1, 0.5); t, k = ct['t'] + 3.2, 0
        while t < (score or tk)['t'] - 1.2: add(t, 'track' if k % 2 else 'chase'); t += 2.8; k += 1
    else:
        add(0, 'wide')
        if th:
            add(S + 0.45, 'qb' if ev('escape') else 'behind_qb'); add(th['t'] - 0.1, 'ball')
            c = ct or it or inc; add(c['t'] - (0.55 if th['T'] > 1.2 else 0.3), 'catch', pt=c['pos']); slow(c['t'] - 0.2, c['t'] + 0.16, 0.3)
            if inc: add(c['t'] + 0.5, 'wide', soft=True)
            elif not (score and abs(score['t'] - c['t']) < 0.3): add(c['t'] + 0.38, 'track')
        elif ho: add(ho['t'] - 0.25, 'chase'); add(ho['t'] + 1.3, 'track')
        elif sack: add(S + 0.45, 'behind_qb')
        if sack: add(sack['t'] - 0.55, 'low', who=sack['qb']); slow(sack['t'] - 0.12, sack['t'] + 0.22, 0.35)
        if fu:
            add(fu['t'] + 0.25, 'loose')
            if rc: add(rc['t'] + 0.35, 'track' if score else 'low', who=rc['who'])
    if style == 'cinematic':
        last = score or tk; first = ct or it or ho
        if last and first and not kick and not sim.no_scrimmage and last['t'] - first['t'] > 5:
            t, k = first['t'] + 3, 0
            while t < last['t'] - 1.4: add(t, 'track' if k % 2 else 'chase'); t += 2.6; k += 1
        for m in moves:                                           # stiff arm / spin / hurdle: get low and slow it down
            add(m['t'] - 0.45, 'low', who=m['who']); slow(m['t'] - 0.15, m['t'] + 0.3, 0.4); add(m['t'] + 0.55, 'track')
        if tk and not sack and not (fu and fu['t'] == tk['t'] and score):
            add(tk['t'] - 0.5, 'low', who=tk['who']); slow(tk['t'] - 0.1, tk['t'] + 0.2, 0.4 if tk.get('big') else 0.6)
            if not fu: add(tk['t'] + 1.1, 'wide', soft=True)
        if score and not kick: add(score['t'] - 0.75, 'endzone', who=score['who']); slow(score['t'] - 0.12, score['t'] + 0.15, 0.45); add(score['t'] + 1.0, 'celebrate')
        elif sack and not fu: add(sack['t'] + 1.15, 'celebrate')
    shots.sort(key=lambda s: s['t0'])
    for a, b in zip(shots, shots[1:]): a['t1'] = b['t0']
    shots[-1]['t1'] = end + 1; warp.sort(key=lambda w: w['a'])
    return {'shots': shots, 'warp': warp, 'style': style}


def rate_at(dirn, t):
    for w in dirn['warp']:
        if w['a'] - 0.08 <= t <= w['b'] + 0.08:
            k = min(clamp((t - (w['a'] - 0.08)) / 0.08), clamp(((w['b'] + 0.08) - t) / 0.08)); return lerp(1.0, w['rate'], smooth(k))
    return 1.0


def shot_at(dirn, t): return next((s for s in dirn['shots'] if s['t0'] <= t < s['t1']), dirn['shots'][-1])


class CameraRig:
    def __init__(self, coll, aspect, dof=True):
        cd = bpy.data.cameras.new('HighlightCam'); cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24.0; cd.clip_start = 0.1; cd.clip_end = 900; cd.dof.use_dof = dof
        self.ob = bpy.data.objects.new('HighlightCam', cd); coll.objects.link(self.ob); bpy.context.scene.camera = self.ob
        self.aspect = aspect; self.key = None; self.p = Vector(); self.t = Vector(); self.fov = 40.0; self.focus = 20.0; self.orbit = 0.0; self.wall = 0.0

    def update(self, sim, shot, players, ball, frame, dt, seg='main', intensity=1.0, ball_target=None):
        """players: {Player: (x, y, z, face, speed, ...)} in yards; ball: world position in yards. dt = wall seconds since last frame."""
        F = sim.focus; wide = self.aspect > 1; L = sim.L; self.wall += dt; t = sim.t
        P = lambda p: Vector((players[p][0], players[p][1], players[p][2])) if p in players else Vector((ball[0], ball[1], 0))
        car = shot.get('who') or sim_carrier(sim, t) or (None if in_air(sim, t) else sim.hero) or F.get('target') or F.get('qb')
        sub = P(car) if car is not None else Vector((ball[0], ball[1], 0)); b = Vector(ball)
        hero_def = sim.hero_team == 'D' and car is not None and car.team == 'D'
        d = -1 if (hero_def and shot['type'] not in ('wide', 'behind_qb', 'qb')) else 1; side = 1 if sub.y >= 0 else -1
        fov = 34 if wide else 40; fstop = 5.6; focus_on = sub + Vector((0, 0, 1.2)); typ = shot['type']
        if typ == 'wide':
            if wide: pos, tgt = Vector((b.x + 2 * d, -38, 15)), Vector((b.x + 2 * d, b.y * 0.4, 0)); fov = 30
            else: pos, tgt = Vector((b.x - 16.5 * d, b.y * 0.4, 11)), Vector((b.x + 7 * d, b.y * 0.65, 0.4))
            fstop = 11; focus_on = Vector((b.x, b.y, 1))
        elif typ == 'behind_qb':
            q = P(F['qb']); tg = P(F.get('target') or F['qb']); pos, tgt = Vector((q.x - 6.6, q.y - (tg.y - q.y) * 0.03, 3.1)), Vector((q.x + 10, lerp(q.y, tg.y, 0.07), 1.0)); fov = 44 if wide else 48; fstop = 4; focus_on = q + Vector((0, 0, 1.4))
        elif typ == 'qb':
            q = P(F['qb']); pos, tgt = Vector((q.x + 4.6, q.y - 3.6, 1.5)), Vector((q.x, q.y, 1.45)); fstop = 2.8; focus_on = q + Vector((0, 0, 1.4)); fov = 30 if wide else 36
        elif typ == 'ball':                                      # telephoto-ish chase of the ball toward the target
            tg = ball_target or (b.x + 10, b.y, 1); dv = Vector((tg[0] - b.x, tg[1] - b.y, 0)); n = dv.length or 1
            pos = Vector((b.x - dv.x / n * 5.5, b.y - dv.y / n * 5.5 + 0.8, max(1.9, b.z + 0.7))); tgt = Vector((lerp(b.x, tg[0], 0.3), lerp(b.y, tg[1], 0.3), lerp(b.z, tg[2] if len(tg) > 2 else 1.5, 0.3)))
            fov = 30 if wide else 36; fstop = 3.2; focus_on = b
        elif typ == 'catch':
            pt = shot.get('pt') or (sub.x, sub.y, 1.8); s2 = 1 if pt[1] >= 0 else -1; pos = Vector((pt[0] + 4.8, pt[1] - s2 * 5.0, 0.75)); away = clamp(((sub - Vector(pt)).xy.length - 1.5) / 2.5) if car is not None and not in_air(sim, t) else 0.0
            tgt = Vector((pt[0], pt[1], pt[2] - 0.6)).lerp(sub + Vector((0, 0, 1.2)), away); fov = 26 if wide else 32; fstop = 2.0; focus_on = Vector(pt).lerp(sub + Vector((0, 0, 1.2)), away)
        elif typ == 'track': pos, tgt = Vector((sub.x - 5.5 * d, sub.y - side * 8.6, 2.4)), Vector((sub.x + 3 * d, sub.y, 1.15)); fstop = 2.8; fov = 32 if wide else 38
        elif typ == 'sideline': pos, tgt = Vector((sub.x + 1.5 * d, -31, 3.2)), Vector((sub.x + 1.5 * d, sub.y, 1.2)); fov = 22 if wide else 30; fstop = 4
        elif typ == 'chase': pos, tgt = Vector((sub.x - 8.4 * d, sub.y + 0.6, 3.1)), Vector((sub.x + 9 * d, sub.y, 0.9)); fov = 42 if wide else 48; fstop = 4
        elif typ == 'endzone':
            X = 58.8 if d > 0 else -58.8; pos, tgt = Vector((X, sub.y * 0.55 + 1.2, 1.6)), Vector((sub.x, sub.y, 1.25)); fov = 28 if wide else 34; fstop = 2.8
        elif typ == 'low': pos, tgt = Vector((sub.x + 3.8 * d, sub.y - side * 4.0, 0.4)), Vector((sub.x, sub.y, 1.0)); fov = 38 if wide else 44; fstop = 2.4
        elif typ == 'loose': pos, tgt = Vector((b.x + 4.5, b.y - 4.5, 1.2)), Vector((b.x, b.y, 0.5)); fstop = 2.8; focus_on = b
        elif typ in ('celebrate', 'closeup'):
            h = P(sim.hero) if sim.hero is not None else sub; self.orbit += dt * 0.5; a = self.orbit + (0.6 if d > 0 else 2.6)
            pos, tgt = Vector((h.x + math.cos(a) * 5.0, h.y + math.sin(a) * 5.0, 1.35)), Vector((h.x, h.y, 1.5)); fov = 28 if wide else 36; fstop = 2.0; focus_on = h + Vector((0, 0, 1.5))
        elif typ == 'replay':                                    # slow dolly + orbit around the key moment, low and long
            k = shot.get('k', 0.0); who = shot.get('who'); c = P(who) if who is not None else Vector(shot['pt']); a = shot.get('a0', 0.9) + k * 1.1; r = lerp(7.5, 5.2, smooth(k))
            airb = b if in_air(sim, t) else c + Vector((0, 0, 1.3))                           # keep the ball in frame while it is on its way
            pos = Vector((c.x + math.cos(a) * r, c.y + math.sin(a) * r, lerp(0.55, 1.5, k))); tgt = Vector((c.x, c.y, 1.25)).lerp(airb, 0.25)
            fov = 24 if wide else 30; fstop = 1.8; focus_on = Vector((c.x, c.y, 1.3))
        elif typ == 'kick_behind': pos, tgt = Vector((L - 13.5, 1.0, 2.5)), Vector((60, 0, 4.4)); fov = 40 if wide else 46; fstop = 5.6; focus_on = Vector((L - 7, 0, 1))
        elif typ == 'posts': pos, tgt = Vector((67, 2.4, 2.0)), Vector((b.x, b.y, max(3, b.z))); fov = 42 if wide else 48; fstop = 5.6; focus_on = b
        elif typ == 'sky': pos, tgt = Vector((sub.x - 8.5, sub.y + 3.2, 1.3)), Vector((lerp(sub.x, b.x, 0.6), lerp(sub.y, b.y, 0.6), lerp(1.5, b.z, 0.6))); fov = 44 if wide else 50; fstop = 4
        else: pos, tgt = Vector((b.x - 15, 0, 10)), Vector((b.x + 6, 0, 0))
        pos.x = clamp(pos.x, -74, 74); pos.y = clamp(pos.y, -40, 40); pos.z = max(0.3, pos.z)
        key = (id(shot), seg)
        if key != self.key:
            self.key = key; self.p, self.t, self.fov = pos.copy(), tgt.copy(), fov; self.focus = (focus_on - pos).length
            if typ not in ('celebrate', 'closeup'): self.orbit = 0.0
        k = 1 - math.exp(-dt * (4 if shot.get('soft') else 7)); self.p = self.p.lerp(pos, k); self.t = self.t.lerp(tgt, 1 - math.exp(-dt * 10)); self.fov = lerp(self.fov, fov, k)
        self.focus = lerp(self.focus, (focus_on - self.p).length, 1 - math.exp(-dt * 8))
        # subtle handheld life (more on long lenses and close-ups), never random jumps
        w = self.wall; amp = 0.012 * intensity * (1.6 if fov < 34 else 1.0)
        shake = Vector((math.sin(w * 2.3) + 0.5 * math.sin(w * 5.1 + 1.3), math.sin(w * 1.9 + 0.7) + 0.5 * math.sin(w * 4.3), math.sin(w * 2.9 + 2.1) + 0.5 * math.sin(w * 6.1))) * amp * (self.t - self.p).length * 0.25
        cam = self.ob; cam.location = self.p * YD; look = (self.t + shake) * YD - cam.location
        cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler('XYZ', cam.rotation_euler)
        cam.data.lens = 12.0 / math.tan(math.radians(self.fov) / 2); cam.data.dof.focus_distance = max(0.5, self.focus * YD); cam.data.dof.aperture_fstop = fstop
        cam.keyframe_insert('location', frame=frame); cam.keyframe_insert('rotation_euler', frame=frame)
        cam.data.keyframe_insert('lens', frame=frame); cam.data.dof.keyframe_insert('focus_distance', frame=frame); cam.data.dof.keyframe_insert('aperture_fstop', frame=frame)
        return typ


def _seg(sim, t):
    s = None
    for q in sim.ball_segs:
        if q['t0'] <= t: s = q
        else: break
    return s


def sim_carrier(sim, t): s = _seg(sim, t); return s['by'] if s and s['kind'] == 'held' else None
def in_air(sim, t): s = _seg(sim, t); return bool(s and s['kind'] == 'air' and t < s['t1'])
