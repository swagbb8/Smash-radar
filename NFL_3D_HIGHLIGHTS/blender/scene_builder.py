"""Scene builder: one call turns a play into a complete, animated Blender scene.

    play (normalized dict) -> simulate -> record -> stadium + lights + 22 players + ball -> timeline (live play,
    replay, celebration) -> keyframes for every player, the ball, the camera and the effects.

Returns a context dict that render.py uses to render frames, draw the broadcast graphics and mix the sound.
"""
import math, random, time
import bpy, bmesh
from mathutils import Vector, Quaternion
import stadium, lighting, player_system, animation_system as anim, football_system, camera_system, replay_system
from simulation import build_play
from utils import YD, G, clamp, lerp, smooth, hex_linear, log

from scene_builder_presets import RENDER_PRESETS

ORD = ['1ST', '2ND', '3RD', '4TH']
SLAM = {'td': 'TOUCHDOWN!', 'two_pt': '2-POINT GOOD!', 'fg_good': "IT'S GOOD!", 'fg_miss': 'NO GOOD', 'int': 'INTERCEPTION!', 'sack': 'SACK!', 'fumble': 'FUMBLE!', 'tfl': 'STUFFED!', 'oob': 'FIRST DOWN!',
        'two_pt_fail': 'NO GOOD', 'escape': 'ESCAPES!', 'incomplete': 'BROKEN UP!'}
MOVE_SLAM = {'stiff_arm': 'STIFF ARM!', 'spin': 'SPIN MOVE!', 'hurdle': 'HURDLE!', 'broken_tackle': 'BROKEN TACKLE!'}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions): pass
    player_system._cache.clear(); anim._SCALE.clear()
    return bpy.context.scene


def _coll(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c


def configure_render(sc, preset='PREVIEW', aspect='9:16', samples=None, fps=None):
    long, pfps, psamples, mblur, subdiv = RENDER_PRESETS.get(preset, RENDER_PRESETS['PREVIEW']); ar = {'9:16': 9 / 16, '16:9': 16 / 9, '1:1': 1.0}.get(aspect, 9 / 16)
    w, h = (long, int(round(long / ar / 2) * 2)) if ar >= 1 else (int(round(long * ar / 2) * 2), long)
    r = sc.render; r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100; r.fps = fps or pfps; r.engine = 'CYCLES'; r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGB'; r.image_settings.compression = 15
    r.use_motion_blur = mblur; r.use_persistent_data = True; r.film_transparent = False
    c = sc.cycles; c.device = 'CPU'; c.samples = samples or psamples; c.use_adaptive_sampling = True; c.adaptive_threshold = 0.04; c.use_denoising = True
    c.max_bounces = 4; c.diffuse_bounces = 2; c.glossy_bounces = 3; c.transmission_bounces = 2; c.caustics_reflective = False; c.caustics_refractive = False; c.sample_clamp_indirect = 6.0
    try: c.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    if mblur: r.motion_blur_shutter = 0.35
    return {'size': (w, h), 'fps': r.fps, 'aspect': w / h, 'subdiv': subdiv, 'preset': preset}


class Effects:
    """Turf chunks kicked up by cuts / hits / kicks and confetti on scores. Driven by play time, so they also show in replays."""

    def __init__(self, coll, events, colors, fx=1.0):
        self.items = []; rnd = random.Random(11)
        turf = bpy.data.meshes.new('TurfChunk'); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.035); bm.to_mesh(turf); bm.free()
        tm = bpy.data.materials.new('turf_chunk'); tm.use_nodes = True; tm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex_linear('#28531f'); turf.materials.append(tm)
        conf = bpy.data.meshes.new('Confetti'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.045); bm.to_mesh(conf); bm.free()
        cm = []
        for i, c in enumerate(colors + ['#ffffff', '#ffd84a']):
            m = bpy.data.materials.new(f'confetti_{i}'); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = hex_linear(c); p.inputs['Emission Color'].default_value = hex_linear(c); p.inputs['Emission Strength'].default_value = 0.6; cm.append(m)
        if fx <= 0: return
        for e in events:
            typ = e['type']
            if typ in ('tackle', 'sack', 'move', 'kick', 'miss', 'tfl'):
                who = e.get('who'); pos = e.get('pos') or ((who.x, who.y) if who is not None else None)
                if pos is None: continue
                for k in range(int((16 if e.get('big') or typ == 'sack' else 9) * fx)):
                    a = rnd.random() * math.tau; s = rnd.random(); ob = bpy.data.objects.new('turf', turf); coll.objects.link(ob); ob['s0'] = 0.6 + s
                    self.items.append(dict(ob=ob, t0=e['t'], life=0.75, p0=(pos[0] + rnd.uniform(-0.3, 0.3), pos[1] + rnd.uniform(-0.3, 0.3), 0.05), v=(math.cos(a) * (1 + s * 3), math.sin(a) * (1 + s * 3), 2 + s * 4.5), g=G, spin=rnd.uniform(4, 12), drag=0))
            if typ in ('td', 'two_pt', 'fg_good'):
                who = e.get('who'); pos = (60, 0, 5.5) if typ == 'fg_good' else (who.x if who is not None else 55, who.y if who is not None else 0, 2.6)
                for k in range(int(140 * fx)):
                    a = rnd.random() * math.tau; s = rnd.random(); ob = bpy.data.objects.new('confetti', conf.copy()); coll.objects.link(ob); ob.data.materials.append(cm[k % len(cm)])
                    self.items.append(dict(ob=ob, t0=e['t'] + rnd.uniform(0, 0.25), life=3.4, p0=(pos[0] + rnd.uniform(-1, 1), pos[1] + rnd.uniform(-1, 1), pos[2]), v=(math.cos(a) * (1.5 + s * 6), math.sin(a) * (1.5 + s * 6), 5 + s * 8), g=G * 0.45, spin=rnd.uniform(5, 14), drag=1.5, floor=0.02))
        for it in self.items: it['ob'].rotation_mode = 'XYZ'

    def key(self, t, frame):
        for it in self.items:
            u = t - it['t0']; ob = it['ob']
            if 0 <= u <= it['life']:
                d = it['drag']; f = (1 - math.exp(-d * u)) / d if d else u                       # drag slows the scatter, confetti flutters down
                z = it['p0'][2] + it['v'][2] * f - 0.5 * it['g'] * u * u * (0.35 if d else 1)
                ob.location = ((it['p0'][0] + it['v'][0] * f) * YD, (it['p0'][1] + it['v'][1] * f) * YD, max(it.get('floor', 0.03), z * YD)); ob.rotation_euler = (u * it['spin'], u * it['spin'] * 0.7, u * 3)
                k = clamp((it['life'] - u) * 4); ob.scale = (k * (ob.get('s0') or 1),) * 3
            else: ob.location = (0, 0, -5); ob.scale = (0, 0, 0)
            ob.keyframe_insert('location', frame=frame); ob.keyframe_insert('rotation_euler', frame=frame); ob.keyframe_insert('scale', frame=frame)


def add_weather(coll, kind, center=(0, 0)):
    """Optional rain / snow: a particle emitter over the action."""
    if kind not in ('rain', 'snow'): return None
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=45); me = bpy.data.meshes.new('WeatherEmitter'); bm.to_mesh(me); bm.free()
    em = bpy.data.objects.new('WeatherEmitter', me); em.location = (center[0], center[1], 28); coll.objects.link(em)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); dm = bpy.data.meshes.new('Drop'); bm.to_mesh(dm); bm.free(); drop = bpy.data.objects.new('Drop', dm); coll.objects.link(drop)
    drop.scale = (0.012, 0.012, 0.35) if kind == 'rain' else (0.035, 0.035, 0.035); drop.location = (0, 0, -20)
    m = bpy.data.materials.new('drop'); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (1, 1, 1, 1); p.inputs['Emission Color'].default_value = (0.8, 0.9, 1, 1); p.inputs['Emission Strength'].default_value = 0.8 if kind == 'rain' else 1.5; dm.materials.append(m)
    ps = em.modifiers.new('Weather', 'PARTICLE_SYSTEM').particle_system.settings
    ps.count = 6000 if kind == 'rain' else 4000; ps.frame_start = -60; ps.frame_end = 2000; ps.lifetime = 90; ps.emit_from = 'FACE'; ps.normal_factor = 0; ps.render_type = 'OBJECT'; ps.instance_object = drop; ps.particle_size = 1.0
    ps.physics_type = 'NEWTON'; ps.effector_weights.gravity = 1.0 if kind == 'rain' else 0.08; ps.object_align_factor[2] = -1.0 if kind == 'rain' else 0; ps.brownian_factor = 0 if kind == 'rain' else 1.2
    em.show_instancer_for_render = False
    return em


def build_scene(play, preset='PREVIEW', aspect='9:16', samples=None, fps=None, verbose=True):
    t_start = time.time(); sc = reset_scene(); rs = configure_render(sc, preset, aspect, samples, fps); fps = rs['fps']
    sim = build_play(play); rec = anim.Recording(sim); events = rec.events
    teams = play['teams']; off_key = play['offense']; def_key = 'AWAY' if off_key == 'HOME' else 'HOME'; off, dfn = teams[off_key], teams[def_key]
    sb = play['scoreboard']; score0 = [sb['home'], sb['away']]
    c_stad, c_play, c_fx = _coll('Stadium'), _coll('Players'), _coll('FX')
    venue = stadium.build(c_stad, off, dfn, play.get('field_style'), score=score0, quarter=sb['quarter'], clock=sb['clock'])
    lights = lighting.build(c_stad, venue['_dims'], play.get('lighting', 'PRIMETIME'))
    base = player_system.build_base(); rig = anim.Rig(base)
    for o in (base['arm'], base['mesh']): o.hide_render = True; o.hide_viewport = True
    players = {}
    for p in sim.players:
        team_key = off_key if p.team == 'O' else def_key; pl = player_system.spawn(base, c_play, f"{team_key}_{p.pos}_{p.num}", teams[team_key], team_key == 'HOME', p.num, p.pos, p.id)
        for m in pl['body'].modifiers:
            if m.type == 'SUBSURF': m.render_levels = rs['subdiv']
        anim.set_scale(p.id, pl['arm'].scale[0] * 100, pl['arm'].scale[2] * 100); pl['an'] = anim.PlayerAnimator(rig, p.id); players[p] = pl
    ball = football_system.build(c_fx); ball_an = football_system.BallAnimator(ball)
    fx_amount = float(play.get('effects', {}).get('amount', 1.0)); effects = Effects(c_fx, events, [off['primary'], dfn['primary'], off['secondary']], fx_amount)
    add_weather(c_fx, play.get('weather', 'none'), (sim.L * YD, 0))
    dirn = camera_system.direct(sim, events, play.get('camera_style', 'cinematic'), fx_amount)
    timeline, key = replay_system.build_timeline(sim, events, dirn, fps, replay=bool(play.get('replay', True)), duration=play.get('duration'))
    if key:                                                         # where the replay camera orbits
        if key.get('pos'): pt = tuple(key['pos']) + ((1.6,) if len(key['pos']) == 2 else ())
        else: st, _ = rec.at(key['t']); i = sim.players.index(key['who']) if key.get('who') in sim.players else 0; pt = (st[i][0], st[i][1], 1.5)
        for f in timeline:
            if f['seg'] == 'replay': f['shot']['pt'] = pt
    cam = camera_system.CameraRig(c_fx, rs['aspect'], dof=bool(play.get('effects', {}).get('dof', True)))
    crowd = bpy.data.materials.get('crowd'); crowd_em = crowd.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'] if crowd else None
    # ---------------- graphics / sound bookkeeping
    hero_team = (off if sim.hero_team == 'O' else dfn) if sim.hero is not None else off
    score_ev = next((e for e in events if e['type'] in ('td', 'two_pt', 'fg_good')), None)
    def score_at(t, seg):
        s = list(score0)
        if score_ev and (t >= score_ev['t'] or seg != 'main'):
            scorer = off_key if sim.score_team == 'O' else def_key; s[0 if scorer == 'HOME' else 1] += sim.points
        return s
    yd = None if sim.no_scrimmage else int(round(50 - sim.L)); T = play['type']
    down = sb.get('down') or ('KICKOFF' if T == 'kick_return' else 'PUNT' if T == 'punt_return' else '2-PT TRY' if T == 'two_point' else f"4TH DOWN · {play['yards']}-YD KICK" if T == 'field_goal'
                              else f"{ORD[play['yards'] % 3]} & {'GOAL' if yd <= 10 else 10} · {dfn['abbr']} {yd}")
    names = play.get('names') or {}; hero = sim.hero
    hero_name = names.get(str(hero.num)) if hero is not None else None
    graphics, cues = [], []; slam = None; prev_t = 0.0; flash_wall = None; seg_prev = 'main'; seg_change = 0.0; n = len(timeline); dt = 1.0 / fps
    last_log = time.time()
    for i, fr in enumerate(timeline):
        frame = i + 1; t = fr['t']; state, bstate = rec.at(t)                      # (also sets sim.t so acts resolve)
        poses = {}
        for p, st in zip(sim.players, state):
            po = players[p]['an'].pose(sim, p, st); anim.apply(players[p], po, frame); poses[p] = po
        ball_loc = ball_an.place(sim, bstate, poses, frame, t)
        bpos = (ball_loc.x / YD, ball_loc.y / YD, ball_loc.z / YD)
        cam.update(sim, fr['shot'], {p: st for p, st in zip(sim.players, state)}, bpos, frame, dt, fr['seg'], ball_target=bstate[5] if bstate[2] else None)
        effects.key(t, frame)
        if crowd_em is not None:
            exc = 0.0
            if score_ev and t >= score_ev['t']: exc = clamp((t - score_ev['t']) * 3) * (0.55 + 0.45 * math.sin(fr['wall'] * 11) ** 2)
            crowd_em.default_value = 0.18 + 0.4 * exc; crowd_em.keyframe_insert('default_value', frame=frame)
        # ---- graphics + sound for this frame
        if fr['seg'] == 'main':
            for e in (x for x in events if prev_t < x['t'] <= t or (i == 0 and x['t'] <= t)):
                cues.append((fr['wall'], e['type'], bool(e.get('big')) or e['type'] in ('td', 'sack', 'int')))
                txt = SLAM.get(e['type']) or (MOVE_SLAM.get(e.get('move')) if e['type'] == 'move' else None) or ('BIG HIT!' if e['type'] == 'tackle' and e.get('big') and not sim.result_text else None)
                if txt and not (e['type'] == 'fumble' and any(x['type'] == 'sack' for x in events)): slam = (txt, fr['wall'])
                if e['type'] in ('td', 'two_pt', 'fg_good'): flash_wall = fr['wall']
            prev_t = t
        if fr['seg'] != seg_prev: cues.append((fr['wall'], 'whoosh', False)); seg_change = fr['wall']
        g = dict(teams=[teams['HOME'], teams['AWAY']], score=score_at(t, fr['seg']), quarter=sb['quarter'], clock=sb['clock'], down=down if (fr['seg'] == 'main' and t < sim.t_event) else None,
                 label=play['label'], desc=play['desc'], color=hero_team['primary'], replay=fr['replay'], slow=fr['slow'] and not fr['replay'], wall=fr['wall'])
        if slam and fr['seg'] == 'main': g['slam'] = (slam[0], fr['wall'] - slam[1])
        g['cap'] = 0.0 if fr['seg'] != 'main' else clamp(fr['wall'] / 0.4) * (clamp(1 - (fr['wall'] - slam[1]) * 2.5) if slam else 1.0)
        if flash_wall is not None and fr['wall'] - flash_wall < 1.0:
            scorer = off_key if sim.score_team == 'O' else def_key; g['flash'] = (0 if scorer == 'HOME' else 1, 1 - (fr['wall'] - flash_wall)); g['white'] = clamp(0.5 - (fr['wall'] - flash_wall) * 3)
        if fr['seg'] != seg_prev or (fr['seg'] != 'main' and fr['wall'] - seg_change < 0.2): g['white'] = max(g.get('white', 0), clamp(1 - (fr['wall'] - seg_change) / 0.2))
        if hero is not None and (fr['seg'] == 'final' or (fr['seg'] == 'main' and not key and t > sim.t_event + 0.8)):
            t0 = seg_change if fr['seg'] == 'final' else None; k = clamp((fr['wall'] - t0) / 0.35) if t0 is not None else clamp((t - sim.t_event - 0.8) / 0.35)
            g['lower'] = (hero.num, hero_name or f"{hero.pos} #{hero.num}", hero_team, k)
        g['fade'] = max(clamp(1 - fr['wall'] / 0.3), clamp(1 - (n - 1 - i) * dt / 0.35))
        graphics.append(g); seg_prev = fr['seg']
        if verbose and time.time() - last_log > 15: log(f'  animating frame {frame}/{n}'); last_log = time.time()
    sc.frame_start, sc.frame_end = 1, n; sc.frame_set(1)
    total = n / fps
    log(f"scene built in {time.time() - t_start:.1f}s: {play['label']} — {n} frames ({total:.1f}s at {fps} fps), {rs['size'][0]}x{rs['size'][1]}, replay: {'yes' if key else 'no'}")
    return dict(scene=sc, sim=sim, rec=rec, play=play, timeline=timeline, graphics=graphics, cues=cues, frames=n, fps=fps, size=rs['size'], total=total, key=key, dirn=dirn, players=players, ball=ball, camera=cam.ob, render=rs)
