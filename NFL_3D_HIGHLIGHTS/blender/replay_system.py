"""Highlight editing: the output timeline.

build_timeline() turns one play into a broadcast package, frame by frame:
    1. the live play (with short slow-motion beats at the catch / hit / goal line)
    2. an automatic REPLAY of the key moment — different camera, 40-60 % speed, shallow depth of field
    3. the final celebration close-up
Every output frame says which play-time to show (the Recording can be sampled at any time, in any order),
which camera shot to use and which graphics to draw.
"""
from utils import clamp, lerp
from camera_system import rate_at, shot_at

KEY_ORDER = ('move', 'catch', 'int', 'sack', 'fumble', 'tackle', 'incomplete', 'fg_good', 'fg_miss', 'td', 'two_pt', 'handoff')


def key_moment(sim, events):
    """The event the replay is built around, plus the point in space to orbit."""
    big_tackle = next((e for e in events if e['type'] == 'tackle' and e.get('big')), None)
    for typ in KEY_ORDER:
        e = next((e for e in events if e['type'] == typ), None)
        if not e: continue
        if typ == 'tackle' and not big_tackle: continue
        if typ == 'handoff' and not any(x['type'] in ('td', 'two_pt') for x in events): continue
        if typ == 'handoff': e = next(x for x in events if x['type'] in ('td', 'two_pt'))
        pos = e.get('pos'); who = e.get('who')
        return dict(t=e['t'], type=e['type'], who=who, pos=pos)
    return None


def build_timeline(sim, events, dirn, fps, replay=True, replay_speed=0.5, duration=None):
    """-> list of frames: {t, seg, shot, slow, replay, wall}."""
    frames = []; dt = 1.0 / fps; score = next((e for e in events if e['type'] in ('td', 'two_pt', 'fg_good')), None)
    key = key_moment(sim, events) if replay else None
    main_end = sim.duration if not key else min(sim.duration, sim.t_event + (1.9 if score else 1.5))
    t = 0.0; wall = 0.0
    while t < main_end:
        r = rate_at(dirn, t); frames.append(dict(t=t, seg='main', shot=shot_at(dirn, t), slow=r < 0.8, replay=False, wall=wall)); t += dt * r; wall += dt
    if key:
        a, b = max(0.0, key['t'] - 1.5), min(sim.duration - 0.05, key['t'] + 1.0); speed = clamp(replay_speed, 0.3, 0.7); n = int((b - a) / speed * fps)
        shot = dict(type='replay', t0=a, t1=b, who=key.get('who'), pt=None, a0=0.9 if (key.get('pos') or (0, 1))[1] >= 0 else -0.9)
        for i in range(n):
            tt = a + (b - a) * i / n; k = i / max(1, n - 1)
            f = dict(t=tt, seg='replay', shot=dict(shot, k=k), slow=True, replay=True, wall=wall); frames.append(f); wall += dt
        key['frames'] = n
        if score:                                                 # back live for the celebration close-up
            t = max(main_end, sim.t_event + 1.2); cel = dict(type='celebrate', t0=t, t1=sim.duration + 1)
            while t < sim.duration: frames.append(dict(t=t, seg='final', shot=cel, slow=False, replay=False, wall=wall)); t += dt; wall += dt
    return frames, key
