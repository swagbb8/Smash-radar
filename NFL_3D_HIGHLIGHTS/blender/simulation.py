"""Play simulation layer: a structured play -> 22 players with assignments, a physically flying football and an
event timeline (snap, throw, catch, moves, tackle, touchdown ...). Deterministic fixed-step. Pure Python (no bpy).

Field units are yards: x runs goal line (-50) to goal line (+50), end zones out to +-60; y is sideline to sideline
(+-26.67); z is up. The offense always attacks +x.
"""
import math
from utils import G, clamp, lerp, hyp, ang_diff

DT = 1 / 60
VMAX = {'QB': 7.4, 'RB': 9.0, 'FB': 8.2, 'WR': 9.6, 'TE': 8.4, 'OL': 5.4, 'DL': 6.2, 'LB': 8.3, 'CB': 9.4, 'S': 9.2, 'K': 6.5, 'P': 6.5}
GROUP = {'LT': 'OL', 'LG': 'OL', 'C': 'OL', 'RG': 'OL', 'RT': 'OL', 'DE': 'DL', 'DT': 'DL', 'FS': 'S', 'SS': 'S', 'H': 'QB', 'KR': 'WR', 'PR': 'WR', 'LS': 'OL'}
O_NUMS = [12, 28, 72, 66, 61, 64, 77, 87, 11, 14, 17]
D_NUMS = [94, 97, 92, 99, 54, 52, 58, 24, 21, 31, 33]
PASS_TYPES = {'pass_td', 'long_pass', 'short_pass', 'incomplete', 'interception', 'pick_six', 'screen', 'hail_mary', 'one_handed', 'jump_ball', 'sideline_catch'}
RUN_TYPES = {'run', 'breakaway', 'tfl', 'fumble', 'def_td'}


class Player:
    def __init__(self, team, i, pos, x, y):
        self.team, self.i, self.pos, self.grp = team, i, pos, GROUP.get(pos, pos)
        self.id = (0 if team == 'O' else 11) + i
        self.num = (O_NUMS if team == 'O' else D_NUMS)[i]
        self.home = (x, y); self.segs = []; self.acts = []; self.auto = []
        self.rest = 0.0 if team == 'O' else math.pi
        self.face_hint = 0.0
        self.x, self.y, self.z, self.vx, self.vy, self.face, self.speed = x, y, 0.0, 0.0, 0.0, self.rest, 0.0
        self.missed = False; self.stop_at = None; self.stop_seg = None; self.tgt = {}; self.exact_now = False

    def __repr__(self): return f'<{self.team}{self.i} {self.pos} #{self.num}>'


def eval_keys(keys, t):
    if t <= keys[0][0]: return keys[0][1], keys[0][2]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            k = (t - a[0]) / max(1e-6, b[0] - a[0]); return lerp(a[1], b[1], k), lerp(a[2], b[2], k)
    return keys[-1][1], keys[-1][2]


class Sim:
    """Built by build_play(); step it with seek()/step() and read players / ball / events."""

    def __init__(self, play):
        self.play = play; self.S = 1.0; self.players = []; self.O = [None] * 11; self.D = [None] * 11
        self.ball_segs = []; self.events = []; self.hero = None; self.hero_team = 'O'; self.L = 0.0
        self.no_scrimmage = False; self.focus = {}; self.t = 0.0; self.acc = 0.0; self.carrier = None
        self.ball = {'pos': [0, 0, 0.16], 'vel': [0, 0, 0], 'held': None, 'in_air': False, 'loose': False, 'target': None, 'T': 0}

    # ---------------------------------------------------------------- authoring helpers
    def mk(self, team, i, pos, x, y):
        p = Player(team, i, pos, x, y); self.players.append(p); getattr(self, team)[i] = p; return p

    def seg(self, p, t0, kind, **data): p.segs.append(dict(t0=t0, kind=kind, **data)); p.segs.sort(key=lambda s: s['t0'])
    def path(self, p, keys, **o): self.seg(p, keys[0][0], 'path', keys=[tuple(k) for k in keys], **o)
    def hold(self, p, t0, x, y, **o): self.seg(p, t0, 'hold', x=x, y=y, **o)
    def act(self, p, typ, t0, t1, **data): p.acts.append(dict(type=typ, t0=t0, t1=t1, **data))
    def ev(self, t, typ, **data): self.events.append(dict(t=t, type=typ, **data))
    def meet(self, p, t0, tT, pt, **o): self.seg(p, t0, 'meet', pt=tuple(pt), tT=tT, **o)
    def pursue(self, p, t0, **o): self.seg(p, t0, 'pursue', off=(-(0.6 + (p.i % 3) * 0.9), ((p.i % 5) - 2) * 0.8), **o)

    def at(self, p, t):
        s = None
        for q in p.segs:
            if q['t0'] <= t and q['kind'] in ('path', 'hold'): s = q
        if not s: return p.home
        return (s['x'], s['y']) if s['kind'] == 'hold' else eval_keys(s['keys'], t)

    def air(self, t0, Tf, p0, p1, spin=30.0):
        v = ((p1[0] - p0[0]) / Tf, (p1[1] - p0[1]) / Tf, (p1[2] - p0[2] + 0.5 * G * Tf * Tf) / Tf)
        self.ball_segs.append(dict(t0=t0, t1=t0 + Tf, kind='air', p0=tuple(p0), p1=tuple(p1), v=v, spin=spin)); return t0 + Tf

    def held(self, t0, by): self.ball_segs.append(dict(t0=t0, kind='held', by=by))
    def spot(self, t0, pos): self.ball_segs.append(dict(t0=t0, kind='dead', pos=tuple(pos)))

    def loose(self, t0, p0, v0, dur):
        """A fumble / bouncing ball: integrate it now so we know where it ends up."""
        pts, p, v, n, t = [], list(p0), list(v0), 0, 0.0
        while t <= dur + 1e-6:
            pts.append(tuple(p)); v[2] -= G * DT; p = [p[0] + v[0] * DT, p[1] + v[1] * DT, p[2] + v[2] * DT]
            if p[2] < 0.14:
                p[2] = 0.14; v = [v[0] * 0.62 + (0.9 if n % 2 else -0.6), v[1] * 0.62 + (-0.8 if n % 2 else 1.1), abs(v[2]) * 0.48]
                if v[2] < 0.9: v = [v[0] * 0.5, v[1] * 0.5, 0]
                n += 1
            t += DT
        self.ball_segs.append(dict(t0=t0, t1=t0 + dur, kind='loose', pts=pts)); return pts[-1]

    @staticmethod
    def run_to(keys, to, speed):
        l = keys[-1]; t = l[0] + hyp(to[0] - l[1], to[1] - l[2]) / speed; keys.append((t, to[0], to[1])); return t

    @staticmethod
    def cross_x(keys, X, dirn=1):
        for a, b in zip(keys, keys[1:]):
            if (a[1] - X) * dirn < 0 and (b[1] - X) * dirn >= 0: return lerp(a[0], b[0], (X - a[1]) / (b[1] - a[1]))
        return None

    def stop_all(self, team, t0):
        for p in getattr(self, team): self.seg(p, t0 + 0.15 + (p.i % 4) * 0.08, 'stop')

    def tackle(self, carrier, tT, tackler, pt, big=False, back=False, start=None):
        self.meet(tackler, start if start is not None else max(self.S, tT - 1.5), tT, (pt[0] - 0.5 * math.cos(carrier.face_hint), pt[1]), hit=True)
        self.act(tackler, 'dive', tT - 0.2, tT + 0.4); self.act(tackler, 'down', tT + 0.4, 99)
        self.act(carrier, 'fall', tT, tT + 0.5, back=back); self.act(carrier, 'down', tT + 0.5, 99)
        self.ev(tT, 'tackle', who=carrier, by=tackler, big=big, pos=tuple(pt))

    def celebrate(self, hero, team, t0, kind='td'):
        self.hero, self.hero_team = hero, team
        self.act(hero, 'celebrate', t0 + 0.35, 99, style=(hero.num % 3) if kind == 'td' else 3)
        for k, p in enumerate(getattr(self, team)):
            if p is hero: continue
            self.seg(p, t0 + 0.5 + (k % 4) * 0.12, 'follow', who=hero, r=1.7 + (k % 3) * 0.8, a=k * 0.63)
            if k % 3 == 0: self.act(p, 'celebrate', t0 + 2.0, 99, style=1)
        self.stop_all('D' if team == 'O' else 'O', t0)

    def jukes(self, keys, frm, to, speed, n, carrier=None, moves=(), pool=()):
        """Weave toward `to` with n cuts. Each cut can be a named move (stiff_arm / spin / hurdle / broken_tackle) played
        against a defender taken from `pool`, who arrives at the cut and gets beaten."""
        moves, pool = list(moves), list(pool)
        for k in range(1, n + 1):
            q = k / (n + 1); pt = (lerp(frm[0], to[0], q), lerp(frm[1], to[1], q) + (1 if k % 2 else -1) * 3.2)
            t = self.run_to(keys, pt, speed)
            if carrier is not None and moves and pool:
                mv, d = moves.pop(0), pool.pop(0); dirn = 1 if to[0] >= frm[0] else -1
                self.meet(d, max(self.S, t - 1.3), t, (pt[0] + 0.7 * dirn, pt[1] + (0.5 if k % 2 else -0.5)), hit=True)
                if mv == 'hurdle':
                    self.act(d, 'dive', t - 0.3, t + 0.3); self.act(d, 'down', t + 0.3, t + 1.8); self.act(carrier, 'jump', t - 0.28, t + 0.34, h=1.0); self.act(carrier, 'hurdle', t - 0.28, t + 0.34)
                elif mv == 'spin':
                    self.act(carrier, 'spin', t - 0.22, t + 0.4); self.act(d, 'dive', t - 0.05, t + 0.45); self.act(d, 'down', t + 0.45, t + 1.9)
                elif mv == 'stiff_arm':
                    self.act(carrier, 'stiff', t - 0.3, t + 0.3, side=1 if k % 2 else -1); self.act(d, 'fall', t - 0.02, t + 0.45, back=True); self.act(d, 'down', t + 0.45, t + 2.0)
                else:  # broken tackle: he gets a hand on him, the runner stumbles and keeps going
                    self.act(d, 'dive', t - 0.2, t + 0.4); self.act(d, 'down', t + 0.4, t + 1.9); self.act(carrier, 'stumble', t - 0.02, t + 0.5)
                self.ev(t, 'move', move=mv, who=carrier, by=d, pos=pt)
        return self.run_to(keys, to, speed)

    # ---------------------------------------------------------------- formations
    def scrimmage(self, form, L):
        self.L, S = L, self.S; gun = form == 'gun'; sq = min(1.0, (59 - L) / 15)
        if form == 'fg':
            o = [('H', L - 7, 0.55), ('K', L - 10.2, -2.0), ('LT', L - 0.6, 2.4), ('LG', L - 0.6, 1.2), ('LS', L - 0.5, 0), ('RG', L - 0.6, -1.2), ('RT', L - 0.6, -2.4),
                 ('TE', L - 0.7, 3.6), ('TE', L - 0.7, -3.6), ('TE', L - 1.4, 4.9), ('TE', L - 1.4, -4.9)]
            d = [('DE', 0.8, 3.4), ('DT', 0.8, 1.1), ('DT', 0.8, -1.1), ('DE', 0.8, -3.4), ('LB', 0.9, 4.8), ('LB', 0.9, 2.2), ('LB', 0.9, -4.8), ('CB', 0.9, 6.2), ('CB', 0.9, -6.2), ('S', 5, 2), ('S', 5, -2)]
        else:
            o = [('QB', L - 5 if gun else L - 1.15, 0), ('RB', L - 5 if gun else L - 6.6, -1.9 if gun else 0), ('LT', L - 0.75, 2.8), ('LG', L - 0.7, 1.4), ('C', L - 0.55, 0), ('RG', L - 0.7, -1.4), ('RT', L - 0.75, -2.8),
                 ('TE', L - 0.8, -4.3), ('WR', L - 0.5, 18), ('WR', L - 1.3, -19), ('WR', L - 1.3, 9)]
            d = [('DE', 0.9, 3.9), ('DT', 0.9, 1.3), ('DT', 0.9, -1.3), ('DE', 0.9, -3.9), ('LB', 4.6, 5.2), ('LB', 4.6, 0), ('LB', 4.6, -5.2), ('CB', 6.5, 18), ('CB', 6.5, -19), ('FS', 14, -1.5), ('SS', 8.5, 9)]
        for i, (pos, x, y) in enumerate(o): self.mk('O', i, pos, x, y)
        for i, (pos, dx, y) in enumerate(d): self.mk('D', i, pos, min(59.2, L + (dx if dx < 2 else dx * sq + 1.2 * (1 - sq))), y)
        for p in self.players:
            self.hold(p, 0, *p.home)
            if p.grp in ('OL', 'DL') or (p.pos == 'TE' and abs(p.home[1]) < 6) or (form == 'fg' and p.pos != 'K'): self.act(p, 'stance', 0, S + 0.05)
            else: self.act(p, 'ready', 0, S)
        self.spot(0, (L, 0, 0.16)); self.ev(S, 'snap')

    def line_pass(self, t_go):
        S, L = self.S, self.L
        for i in range(2, 7):
            p = self.O[i]; self.path(p, [(S, *p.home), (S + 0.7, p.home[0] - 1.3, p.home[1] * 1.05)], face=0.0); self.act(p, 'block', S + 0.1, t_go + 0.3)
        for i in range(4):
            p = self.D[i]; self.path(p, [(S, *p.home), (S + 0.8, L - 0.3, p.home[1] * 0.95), (t_go, L - 2.7, p.home[1] * 0.75)]); self.act(p, 'block', S + 0.5, t_go); self.pursue(p, t_go + 0.1)

    def line_run(self, sg, t_free):
        S, L = self.S, self.L
        for i in range(2, 7):
            p = self.O[i]; self.path(p, [(S, *p.home), (S + 1.3, p.home[0] + 2.3, p.home[1] - sg * 0.7)], face=0.0); self.act(p, 'block', S + 0.1, t_free + 1.5)
        for i in range(4):
            p = self.D[i]; self.path(p, [(S, *p.home), (S + 1.1, L + 1.7, p.home[1] - sg * 0.6)]); self.act(p, 'block', S + 0.3, t_free); self.pursue(p, t_free, slow=0.75)

    # ---------------------------------------------------------------- stepping
    def finish(self):
        big = any(e['type'] in ('td', 'two_pt', 'fg_good') for e in self.events)
        self.duration = self.t_event + (3.4 if big else 2.2)
        self.ev(self.duration - 0.15, 'whistle')
        self.events.sort(key=lambda e: e['t']); self.ball_segs.sort(key=lambda s: s['t0'])
        has = lambda t: any(e['type'] == t for e in self.events)
        self.result_text = ("IT'S GOOD!" if has('fg_good') else '2-POINT GOOD!' if has('two_pt') else 'TOUCHDOWN!') if big else \
            'INTERCEPTION!' if has('int') else 'FUMBLE!' if has('recover') else 'SACK!' if has('sack') else 'NO GOOD' if has('fg_miss') or has('two_pt_fail') else \
            'STUFFED!' if has('tfl') else 'INCOMPLETE' if has('incomplete') else None
        sc = next((e for e in self.events if e['type'] in ('td', 'two_pt', 'fg_good')), None)
        self.score_team = (sc.get('team') or 'O') if sc else None
        self.points = 6 if has('td') else 3 if has('fg_good') else 2 if has('two_pt') else 0
        self._init = [(p.home[0], p.home[1], p.rest) for p in self.players]
        self.reset(); return self

    def reset(self):
        self.t = 0.0; self.acc = 0.0; self.events = [e for e in self.events if not e.get('auto')]
        self.ball.update(pos=[0, 0, 0.16], vel=[0, 0, 0], held=None, in_air=False, loose=False)
        for p, (x, y, f) in zip(self.players, self._init):
            p.x, p.y, p.z, p.vx, p.vy, p.face, p.speed, p.missed, p.auto, p.stop_at, p.stop_seg = x, y, 0.0, 0.0, 0.0, f, 0.0, False, [], None, None
        self.carrier = None; self._ball(0.0)

    def seek(self, t):
        if t < self.t - 1e-9: self.reset()
        while self.t + DT <= t + 1e-9: self._step()

    def events_between(self, a, b): return [e for e in self.events if a < e['t'] <= b]

    def act_of(self, p, typ):
        t = self.t
        for a in p.acts + p.auto:
            if a['type'] == typ and a['t0'] <= t < a['t1']:
                r = dict(a); r['ph'] = clamp((t - a['t0']) / max(1e-6, min(a['t1'], 98) - a['t0'])); r['el'] = t - a['t0']; return r
        return None

    def _seg_at(self, p, t):
        s = None
        for q in p.segs:
            if q['t0'] > t: break
            if q['kind'] == 'meet' and t <= q['tT'] + 0.02: return q      # a scripted meeting (tackle, interception) wins until it happens
            s = q
        return s

    def _ball(self, t):
        s = None
        for q in self.ball_segs:
            if q['t0'] <= t: s = q
            else: break
        b = self.ball
        if not s: return
        prev = list(b['pos']); b['held'] = None; b['in_air'] = False; b['loose'] = False
        if s['kind'] == 'held':
            h = s['by']; b['held'] = h; b['pos'] = [h.x + math.cos(h.face) * 0.28, h.y + math.sin(h.face) * 0.28, h.z + 1.2]
        elif s['kind'] == 'air':
            u = min(t, s['t1']) - s['t0']; p0, v = s['p0'], s['v']
            b['pos'] = [p0[0] + v[0] * u, p0[1] + v[1] * u, p0[2] + v[2] * u - 0.5 * G * u * u]; b['in_air'] = t < s['t1']; b['target'] = s['p1']; b['T'] = s['t1'] - s['t0']
        elif s['kind'] == 'loose':
            i = min(len(s['pts']) - 1, round((t - s['t0']) / DT)); b['pos'] = list(s['pts'][i]); b['loose'] = True
        else: b['pos'] = list(s['pos'])
        b['vel'] = [(b['pos'][k] - prev[k]) / DT for k in range(3)]
        self.carrier = b['held']

    def _target(self, p, t):
        s = self._seg_at(p, t)
        if not s: return dict(x=p.x, y=p.y)
        k = s['kind']
        if k == 'hold': return dict(x=s['x'], y=s['y'], exact=t < self.S, face=s.get('face'))
        if k == 'path':
            x, y = eval_keys(s['keys'], t); return dict(x=x, y=y, exact=bool(s.get('exact')), face=s.get('face'))
        if k == 'meet':
            rem = s['tT'] - t
            if rem <= 0: return dict(x=s['pt'][0], y=s['pt'][1], exact=bool(s.get('exact')) and rem > -0.05, hit=s.get('hit'))
            return dict(x=s['pt'][0], y=s['pt'][1], arrive_in=rem, exact_meet=bool(s.get('exact')))
        if k == 'cover':
            w = s['who']; x, y = w.x + s['dx'] + w.vx * 0.15, w.y + s['dy']
            if s.get('max') and hyp(x - p.home[0], y - p.home[1]) > s['max']: x, y = p.x, p.y
            return dict(x=x, y=y)
        if k == 'pursue':
            c, b = self.carrier, self.ball
            if c is not None and c.team != p.team:
                lead = s.get('lead', 0.22); dirn = (1 if c.vx >= 0 else -1)
                x, y = c.x + c.vx * lead + s['off'][0] * dirn * 0.6, c.y + c.vy * lead + s['off'][1] * 0.5
            elif b['in_air'] and b['target']: x, y = b['target'][0] + s['off'][0] * 0.5, b['target'][1] + s['off'][1]
            elif c is not None: x, y = p.x, p.y
            else: x, y = b['pos'][0], b['pos'][1]
            return dict(x=x, y=y, slow=s.get('slow'), chase=True)
        if k == 'follow':
            w = s['who']; return dict(x=w.x - math.cos(s['a']) * s['r'] + ((-2 if w.vx >= 0 else 2) if s.get('lead') else 0), y=w.y - math.sin(s['a']) * s['r'], jog=not s.get('lead'), face_to=w)
        if k == 'stop':
            if p.stop_seg is not s: p.stop_seg = s; p.stop_at = (p.x + p.vx * 0.5, p.y + p.vy * 0.5)
            return dict(x=p.stop_at[0], y=p.stop_at[1], jog=True)
        return dict(x=p.x, y=p.y)

    def _step(self):
        t = self.t + DT; pre = t < self.S and not self.no_scrimmage; self.t = t
        for p in self.players:
            o = self._target(p, t); p.tgt = o
            down = self.act_of(p, 'down') or self.act_of(p, 'fall') or self.act_of(p, 'dive')
            if pre or o.get('exact'):
                p.vx, p.vy = ((o['x'] - p.x) / DT, (o['y'] - p.y) / DT) if not pre else (0.0, 0.0); p.x, p.y = o['x'], o['y']
            elif down and not o.get('hit') and not (o.get('arrive_in', 0) > 0):
                p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx * DT; p.y += p.vy * DT
            else:
                dx, dy = o['x'] - p.x, o['y'] - p.y; d = hyp(dx, dy)
                vm = VMAX.get(p.grp, 8.0) * (o.get('slow') or 1) * (0.45 if o.get('jog') else 1)
                sp = min(vm, math.sqrt(2 * 18 * d))
                if o.get('arrive_in', 0) > 0:
                    sp = d / o['arrive_in'] if o.get('exact_meet') else min(vm * 1.12, max(d / o['arrive_in'], vm * 0.35 if d > 0.5 else 0))
                wx, wy = (dx / d * sp, dy / d * sp) if d > 0.03 else (0.0, 0.0)
                ax, ay = wx - p.vx, wy - p.vy; a = hyp(ax, ay); am = (60 if o.get('exact_meet') else 24) * DT
                if a > am: p.vx += ax / a * am; p.vy += ay / a * am
                else: p.vx, p.vy = wx, wy
                p.x += p.vx * DT; p.y += p.vy * DT
            p.exact_now = pre or bool(o.get('exact'))
        if not pre:                                                   # nobody runs through anybody
            ps = self.players
            for _ in range(2):
                for i in range(len(ps)):
                    a = ps[i]
                    for j in range(i + 1, len(ps)):
                        b = ps[j]; dx, dy = b.x - a.x, b.y - a.y
                        if abs(dx) > 0.92 or abs(dy) > 0.92: continue
                        d = hyp(dx, dy) or 1e-3
                        if d >= 0.92 or (a.exact_now and b.exact_now): continue
                        if a.tgt.get('hit') or b.tgt.get('hit') or self.act_of(a, 'down') or self.act_of(b, 'down'): continue
                        if b.team == a.team and (self.act_of(a, 'celebrate') or self.act_of(b, 'celebrate')): continue
                        fa = 0 if a.exact_now else 2 if b.exact_now else 1; fb = 2 - fa; push = (0.92 - d) / 2; ux, uy = dx / d, dy / d
                        a.x -= ux * push * fa; a.y -= uy * push * fa; b.x += ux * push * fb; b.y += uy * push * fb
        self._ball(t)
        c = self.carrier
        for p in self.players:
            p.speed = hyp(p.vx, p.vy)
            # chasers who get close but aren't the scripted tackler dive and miss
            if (c is not None and p.team != c.team and p.tgt.get('chase') and not p.missed and not pre and hyp(p.x - c.x, p.y - c.y) < 1.55 and hyp(c.vx, c.vy) > 5
                    and not self.act_of(c, 'fall') and not self.act_of(c, 'down') and not self.act_of(c, 'celebrate')):
                p.missed = True
                h = math.sin((p.id * 7.3 + round(self.duration * 10)) * 127.1) * 43758.5453; h -= math.floor(h)
                if h < 0.7:
                    p.auto += [dict(type='dive', t0=t, t1=t + 0.45), dict(type='down', t0=t + 0.45, t1=t + 1.9)]
                    self.events.append(dict(t=t + 0.001, type='miss', who=p, by=c, auto=True)); self.events.sort(key=lambda e: e['t'])
            o = p.tgt; thr = self.act_of(p, 'throw') or self.act_of(p, 'catch') or self.act_of(p, 'catch1'); want = p.face
            if thr and thr.get('toward') and not thr.get('over'): want = math.atan2(thr['toward'][1] - p.y, thr['toward'][0] - p.x)
            elif o.get('face') is not None: want = o['face']
            elif p.speed > 1.3: want = math.atan2(p.vy, p.vx)
            elif o.get('face_to') is not None: want = math.atan2(o['face_to'].y - p.y, o['face_to'].x - p.x)
            elif pre: want = p.rest
            elif t > self.S and not self.act_of(p, 'down'): want = math.atan2(self.ball['pos'][1] - p.y, self.ball['pos'][0] - p.x)
            p.face += ang_diff(p.face, want) * min(1.0, DT * (14 if thr or o.get('face') is not None else 9))
            j = self.act_of(p, 'jump'); p.z = (j.get('h') or 0.9) * math.sin(math.pi * j['ph']) if j else 0.0


def sgn_of(d): return 1 if d == 'left' else -1 if d == 'right' else 0


# ====================================================================================== play builders
def build_play(play):
    """play: normalized dict from play_parser.normalize(). Returns a ready-to-step Sim."""
    sim = Sim(play); T = play['type']
    if T == 'field_goal': sim.t_event = _field_goal(sim)
    elif T in ('punt_return', 'kick_return'): sim.t_event = _return(sim)
    elif T in ('sack', 'strip_sack'): sim.t_event = _sack(sim)
    elif T in RUN_TYPES or (T == 'two_point' and play.get('mode') == 'run'): sim.t_event = _run(sim)
    else: sim.t_event = _pass(sim)
    return sim.finish()


def _free_defenders(sim, exclude=()):
    return [d for d in (sim.D[5], sim.D[9], sim.D[6], sim.D[4], sim.D[10]) if d not in exclude]


def _pass(sim):
    play, S = sim.play, sim.S; T, f, yards = play['type'], play['flags'], play['yards']
    is_int = T in ('interception', 'pick_six'); hail = T == 'hail_mary'; screen = T == 'screen'; two = T == 'two_point'; inc = T == 'incomplete'
    td = play['result'] == 'td' or (two and play['result'] == 'good')
    start = 2 if two else clamp(yards, 35, 60) if hail else yards if td else clamp(yards + 22, 28, 80)
    air_y = play.get('air')
    if air_y is None:
        air_y = yards + 5 if hail else -1.5 if screen else (max(yards * 0.72, yards - 14) if yards > 14 else yards + 2.5) if td else yards * (0.8 if yards > 15 else 0.6)
    if is_int:
        ret = clamp(play.get('return_yards') or yards, 10, 99) if T == 'pick_six' else None; air_y = 14
        start = clamp(100 - ret + air_y, 20, 95) if ret is not None else 55
    sim.scrimmage('gun', 50 - clamp(play.get('start_yd') or start, 1, 99)); L = sim.L
    qb, rb = sim.O[0], sim.O[1]; sg = sgn_of(play.get('dir')) or 1
    tgt = rb if screen else sim.O[10] if play.get('dir') == 'middle' else sim.O[8] if sg > 0 else sim.O[9]
    cover = sim.D[4] if screen else sim.D[7] if tgt is sim.O[8] else sim.D[8] if tgt is sim.O[9] else sim.D[10]
    if play.get('target') is not None: tgt.num = play['target']
    if play.get('passer') is not None: qb.num = play['passer']
    if play.get('defender') is not None: cover.num = play['defender']
    y0 = tgt.home[1]; side = (1 if y0 > 0 else -1 if y0 < 0 else sg)
    route = play.get('route') or ('hail' if hail else 'out' if f.get('sideline') else 'go' if f.get('over_shoulder') else 'post' if air_y >= 22 else 'dig' if air_y >= 10 else 'slant')
    cx = min(58.4, L + air_y)
    cy = {'go': y0 * 0.93, 'fade': y0 * 0.93, 'post': y0 * 0.3, 'corner': side * 21.5, 'out': side * 24.9, 'comeback': side * 24.9, 'hail': side * 3, 'slant': y0 * 0.25, 'crosser': y0 * 0.25, 'cross': y0 * 0.25,
          'drag': y0 * 0.25, 'in': y0 * 0.3, 'dig': y0 * 0.4, 'seam': y0 * 0.55, 'curl': y0 * 0.8, 'wheel': side * 22}.get(route, y0 * 0.5)
    if f.get('sideline'): cy = side * 24.9
    if screen: cx, cy = L - 1.5, sg * 9
    if td and cx < 50 and L + yards >= 50 and air_y >= yards: cx = min(58, 53)
    C = (cx, cy)
    drop = 3.0 if hail else 2.9 if f.get('scramble') else 1.55 if screen else 1.0 if air_y < 8 else 1.55
    q_throw = (L - 6.4, -side * 7.5) if f.get('scramble') else (L - (9.5 if screen else 7.4), 0)
    dist = hyp(C[0] - q_throw[0], C[1] - q_throw[1])
    Tf = 0.75 if screen else clamp(0.42 + dist * (0.05 if hail else 0.04), 0.5, 3.2)
    tm = play.get('timing') or {}
    if tm.get('throw_time') is not None and tm.get('catch_time') is not None: Tf = clamp(tm['catch_time'] - tm['throw_time'], 0.4, 4.0)
    if screen: brk = (L - 3, sg * 5)
    elif route in ('post', 'corner', 'dig', 'out', 'comeback', 'in', 'curl', 'wheel'): brk = (L + max(3, air_y * 0.62), y0)
    else: brk = (lerp(tgt.home[0], C[0], 0.5), lerp(y0, C[1], 0.5 if route in ('go', 'fade') else 0.25))
    rl1, rl2 = hyp(brk[0] - tgt.home[0], brk[1] - y0), hyp(C[0] - brk[0], C[1] - brk[1])
    wr_v = 8.9 * clamp(play.get('route_speed') or 1.0, 0.6, 1.15)
    t_catch = max(S + drop + Tf, S + 0.15 + (rl1 + rl2) / wr_v)
    if tm.get('catch_time') is not None: t_catch = max(t_catch, tm['catch_time'])   # JSON timings can delay, never break physics
    t_throw = t_catch - Tf; tb = S + 0.15 + (t_catch - S - 0.15) * rl1 / (rl1 + rl2)
    # quarterback
    if f.get('scramble'):
        sim.path(qb, [(S, *qb.home), (S + 0.9, L - 7.4, 0), (S + 1.5, L - 7.6, 0.3), (S + 2.0, L - 9, -side * 3), (t_throw - 0.25, *q_throw)], exact=True, face=0.0)
        de = sim.D[0 if side > 0 else 3]
        sim.meet(de, S + 0.3, S + 1.75, (L - 7.4, side * 0.6)); sim.act(de, 'dive', S + 1.6, S + 2.1); sim.act(de, 'down', S + 2.1, S + 3.4); sim.ev(S + 1.75, 'escape', who=qb, by=de)
    else:
        sim.path(qb, [(S, *qb.home), (S + 0.25, *qb.home), (min(t_throw - 0.3, S + 1.1), *q_throw)], exact=True, face=0.0)
    sim.act(qb, 'throw', t_throw - 0.45, t_throw + 0.3, toward=C)
    short = (C[0] - 1.1, C[1] - side * 0.9) if is_int else (C[0] - 0.9, C[1] + side * 0.6) if inc else C
    keys = [(S, *tgt.home), (S + 0.15, *tgt.home), (tb, *brk), (t_catch, *short)]
    jump = f.get('jump_ball') or hail
    zc = 2.75 if jump else 2.45 if f.get('one_hand') else 1.95 if f.get('over_shoulder') else 1.5 if screen else 1.75
    hero = tgt; pool = _free_defenders(sim, (cover,)); moves = list(play.get('moves') or [])
    if inc:                                               # defender breaks it up
        sim.act(tgt, 'catch', t_catch - 0.3, t_catch + 0.15, toward=q_throw); sim.act(tgt, 'jump', t_catch - 0.3, t_catch + 0.25, h=0.5)
        sim.meet(cover, t_throw, t_catch, (C[0] + 0.25, C[1] - side * 0.2), exact=True); sim.act(cover, 'reach', t_catch - 0.3, t_catch + 0.2); sim.act(cover, 'jump', t_catch - 0.3, t_catch + 0.25, h=0.75)
        sim.path(tgt, keys + [(t_catch + 1.0, short[0] + 3, short[1])], exact=True)
        rest = sim.loose(t_catch, (*C, zc), (3.5, -side * 2.5, -1.0), 1.1); sim.spot(t_catch + 1.1, rest)
        sim.ev(t_catch, 'incomplete', who=cover, pos=(*C, zc)); t_event = t_catch + 0.3
        sim.stop_all('O', t_catch + 0.5); sim.stop_all('D', t_catch + 0.6); sim.hero, sim.hero_team = cover, 'D'
    elif not is_int:
        sim.act(tgt, 'catch1' if f.get('one_hand') else 'catch', t_catch - 0.32, t_catch + 0.18, toward=q_throw, over=bool(f.get('over_shoulder')))
        if jump: sim.act(tgt, 'jump', t_catch - 0.36, t_catch + 0.3, h=1.05)
        sim.act(tgt, 'carry', t_catch + 0.18, 99)
        sim.ev(t_catch, 'catch', who=tgt, pos=(*C, zc), one_hand=bool(f.get('one_hand')), jump=bool(jump))
        end_x = L + yards
        if td:
            E = (max(C[0], 50) + 4.5, clamp(C[1] * 0.92, -24, 24))
            if C[0] < 50:
                n = max(len(moves), 2 if f.get('juke') else 1 if end_x - C[0] > 18 else 0)
                if n: sim.jukes(keys, C, E, 9.2, n, tgt, moves, pool)
                else: sim.run_to(keys, E, 9.2)
            else: sim.run_to(keys, (min(58.6, C[0] + 2.2), C[1] * 0.96), 5)
            t_event = max(t_catch, sim.cross_x(keys, 50) or t_catch)
            sim.ev(t_event, 'two_pt' if two else 'td', who=tgt, team='O'); sim.celebrate(tgt, 'O', t_event)
        elif two: t_event = t_catch + 0.2; sim.ev(t_event, 'two_pt_fail', who=tgt)
        elif f.get('sideline'):
            sim.run_to(keys, (C[0] + 1.6, side * 27.6), 5); t_event = keys[-1][0]; sim.ev(t_event, 'oob', who=tgt); sim.run_to(keys, (C[0] + 3, side * 29), 2.5)
            sim.stop_all('D', t_event); sim.stop_all('O', t_event + 0.2)
        else:
            E = (min(49, max(end_x, C[0] + 1.5)), C[1] + (-side * 2 if f.get('juke') else 0)); n = max(len(moves), 1 if f.get('juke') else 0)
            tT = sim.jukes(keys, C, E, 9, n, tgt, moves, pool) if n else sim.run_to(keys, E, 9); tgt.face_hint = 0.0
            sim.tackle(tgt, tT, cover, E, big=yards >= 25); t_event = tT
        sim.path(tgt, keys, exact=True)
        if not td and not f.get('sideline') and not two: sim.seg(tgt, t_event + 0.05, 'stop')
    else:                                                 # interception: the defender jumps the route
        sim.path(tgt, keys, exact=True); sim.act(tgt, 'catch', t_catch - 0.25, t_catch + 0.2, toward=q_throw)
        hero = cover; sim.meet(cover, t_throw, t_catch, C, exact=True)
        sim.act(cover, 'catch', t_catch - 0.3, t_catch + 0.18, toward=q_throw); sim.act(cover, 'jump', t_catch - 0.3, t_catch + 0.25, h=0.7); sim.act(cover, 'carry', t_catch + 0.2, 99)
        sim.ev(t_catch, 'int', who=cover, pos=(*C, 2.3))
        rk = [(t_catch, *C), (t_catch + 0.35, C[0] - 1, C[1] - side * 1.5)]
        if T == 'pick_six' or play['result'] == 'td':
            sim.jukes(rk, (C[0] - 1, C[1] - side * 1.5), (-54.5, clamp(C[1] * 0.3, -20, 20)), 9.4, 2)
            t_event = sim.cross_x(rk, -50, -1); sim.ev(t_event, 'td', who=cover, team='D'); sim.path(cover, rk, exact=True)
            for p in sim.O: sim.pursue(p, t_catch + 0.35 + (p.i % 3) * 0.1)
            sim.celebrate(cover, 'D', t_event)
        else:
            E = (C[0] - clamp(play.get('return_yards') or 14, 3, 60), C[1] - side * 5)
            tT = sim.run_to(rk, E, 9.2); sim.path(cover, rk, exact=True); cover.face_hint = math.pi
            for p in sim.O:
                if p is not tgt: sim.pursue(p, t_catch + 0.35 + (p.i % 3) * 0.1)
            sim.tackle(cover, tT, tgt, E); t_event = tT; sim.seg(cover, tT + 0.05, 'stop')
        sim.hero, sim.hero_team = cover, 'D'
    # ball
    snap_t = sim.air(S, 0.3, (L, 0, 0.3), (qb.home[0] + 0.35, 0.1, 1.15), spin=8); sim.held(snap_t, qb)
    sim.air(t_throw, Tf, (q_throw[0] + 0.4, q_throw[1] + 0.35, 2.05), (*C, zc), spin=play.get('spin_rate') or 32)
    if not inc: sim.held(t_catch, hero)
    sim.ev(t_throw, 'throw', who=qb, to=C, T=Tf, deep=dist > 28)
    # everyone else on offense
    sim.line_pass(t_throw)
    if screen:
        for k, i in enumerate((2, 3, 4)):
            p = sim.O[i]; sim.path(p, [(S, *p.home), (S + 0.8, p.home[0] - 1, p.home[1]), (t_catch + 0.2, L + 1 + k * 2.2, sg * (6 + k * 2.2)), (t_catch + 2.2, L + 12 + k * 3, sg * (7 + k * 2.5))]); sim.act(p, 'block', t_catch, t_catch + 3)
        sim.path(rb, [(S, *rb.home), (S + 0.5, L - 5.5, sg * 1), (t_catch, *C)], exact=True)
    else:
        sim.path(rb, [(S, *rb.home), (S + 0.6, L - 4.4, rb.home[1] * 0.7)], face=0.0); sim.act(rb, 'block', S + 0.5, t_throw)
    others = [p for p in (sim.O[7], sim.O[8], sim.O[9], sim.O[10]) if p is not tgt]
    for k, p in enumerate(others):
        d = (C[0] - 1.5 + k * 1.2, C[1] + (k - 1) * 2.2) if hail else (min(58, p.home[0] + 14 + k * 4), p.home[1] * (0.5 if k == 1 else 0.92) + (-3 if p.pos == 'TE' else 0))
        sim.path(p, [(S, *p.home), (S + 0.15, *p.home), (t_catch if hail else S + 0.15 + hyp(d[0] - p.home[0], d[1] - p.home[1]) / 8.2, *d)])
        if hail: sim.act(p, 'jump', t_catch - 0.33, t_catch + 0.3, h=0.8)
    # coverage
    for oi, d in ((8, sim.D[7]), (9, sim.D[8]), (10, sim.D[10])):
        wr = sim.O[oi]
        if (is_int or inc) and d is cover: sim.seg(d, S + 0.2, 'cover', who=wr, dx=0.9 if is_int else -0.6, dy=0.0); continue
        beaten = wr is tgt
        sim.seg(d, S + 0.2, 'cover', who=wr, dx=(-1.7 if td or yards > 20 else -0.9) if beaten else 0.7, dy=-(1 if wr.home[1] > 0 else -1) * 0.7)
        if hail: sim.meet(d, t_throw, t_catch, (C[0] + 0.9, C[1] + (oi - 9) * 1.3)); sim.act(d, 'jump', t_catch - 0.3, t_catch + 0.3, h=0.85)
        elif not is_int and not inc: sim.pursue(d, t_catch + (0.05 if beaten else 0.25))
        if (f.get('jump_ball') or f.get('one_hand')) and beaten and not hail:
            sim.act(d, 'jump', t_catch - 0.3, t_catch + 0.28, h=0.8); sim.act(d, 'reach', t_catch - 0.3, t_catch + 0.2)
            next(q for q in d.segs if q['kind'] == 'cover')['dx'] = -0.5
    fs = sim.D[9]
    if not any(q['kind'] == 'meet' for q in fs.segs):
        if f.get('bite'):
            sim.path(fs, [(S, *fs.home), (S + 1.0, L + 7, fs.home[1]), (S + 1.5, L + 7.5, fs.home[1])]); sim.ev(S + 1.0, 'bite', who=fs)
            if not is_int and not inc: sim.pursue(fs, S + 1.6)
        elif hail: sim.meet(fs, S + 0.5, t_catch, (C[0] - 0.9, C[1] - 1.4)); sim.act(fs, 'jump', t_catch - 0.3, t_catch + 0.3, h=0.85)
        else:
            sim.path(fs, [(S, *fs.home), (t_throw, min(58.5, fs.home[0] + 7), fs.home[1] * 0.6)])
            if not is_int and not inc: sim.pursue(fs, t_throw + 0.25, lead=0.5)
    for i in (4, 5, 6):
        p = sim.D[i]
        if any(q['kind'] == 'meet' for q in p.segs): continue
        if screen and p is cover: sim.path(p, [(S, *p.home), (t_catch, L + 3, sg * 6)]); continue
        sim.path(p, [(S, *p.home), (S + 1.4, min(58.8, p.home[0] + 3.5), p.home[1] * 1.15)])
        if not is_int and not inc: sim.pursue(p, t_catch + 0.15)
    if is_int:
        for d in sim.D:
            if d is not cover: sim.seg(d, t_catch + 0.4, 'follow', who=cover, r=3 + (d.i % 3), a=float(d.i), lead=True)
    sim.focus = dict(qb=qb, target=tgt, catch_pt=(*C, zc), t_throw=t_throw, t_catch=t_catch, cover=cover)
    return t_event


def _run(sim):
    play, S = sim.play, sim.S; T, f, yards = play['type'], play['flags'], play['yards']
    tfl = T == 'tfl'; fum = T in ('fumble', 'def_td'); two = T == 'two_point'
    td = (play['result'] == 'td' and not fum) or (two and play['result'] == 'good')
    gain = -clamp(yards, 1, 7) if tfl else 5 if T == 'def_td' else clamp(yards, 2, 30) if fum else yards
    start = 2 if two else yards if td else clamp(gain + 24, 22, 85)
    if T == 'def_td': start = clamp(100 - clamp(play.get('return_yards') or yards, 8, 95) + gain, 8, 95)
    sim.scrimmage('i', 50 - clamp(play.get('start_yd') or start, 1, 99)); L = sim.L
    qb, rb = sim.O[0], sim.O[1]; sg = sgn_of(play.get('dir')) or -1
    if play.get('rusher') is not None: rb.num = play['rusher']
    gap_y = sg * (3.4 if yards > 12 else 1.6); tH = S + 0.72; mesh = (L - 3.3, sg * 0.5)
    sim.path(qb, [(S, *qb.home), (tH, L - 2.9, -sg * 0.25), (tH + 0.8, L - 4.4, -sg * 2.2)], exact=True); sim.act(qb, 'handoff', tH - 0.25, tH + 0.2)
    keys = [(S, *rb.home), (S + 0.12, *rb.home), (tH, *mesh), (tH + 0.42, L + 0.4, gap_y)]
    sim.act(rb, 'carry', tH, 99); sim.ev(tH, 'handoff', who=rb)
    hero, hero_team = rb, 'O'; sim.line_run(sg, tH + 0.5)
    lb, fs = sim.D[5], sim.D[9]; moves = list(play.get('moves') or []); pool = [d for d in (sim.D[6], sim.D[4], sim.D[10], sim.D[9]) if not (gain > 12 and not td and d is fs)]
    if tfl:
        E = (L + gain, gap_y * 0.6); del keys[3:]; tT = sim.run_to(keys, E, 6.5); sim.path(rb, keys, exact=True)
        if play.get('defender') is not None: lb.num = play['defender']
        rb.face_hint = 0.0; sim.tackle(rb, tT, lb, E, big=True, back=True); t_event = tT; hero, hero_team = lb, 'D'; sim.ev(tT, 'tfl', who=lb)
        sim.seg(rb, tT + 0.05, 'stop'); sim.act(lb, 'celebrate', tT + 1.2, 99, style=2); sim.hero, sim.hero_team = lb, 'D'
    elif td:
        E = (54.5, clamp(gap_y * 2.2, -20, 20)); n = max(len(moves), 3 if f.get('juke') else 2 if yards > 30 else 1 if yards > 12 else 0)
        if n: sim.jukes(keys, (L + 0.4, gap_y), E, 9.3, n, rb, moves, pool)
        else: sim.run_to(keys, E, 8.6)
        sim.path(rb, keys, exact=True); t_event = sim.cross_x(keys, 50) or keys[-1][0]
        sim.ev(t_event, 'two_pt' if two else 'td', who=rb, team='O'); sim.celebrate(rb, 'O', t_event)
    else:
        E = (min(49.2, L + gain), gap_y * 2 + (sg * 3 if f.get('juke') else 0)); n = max(len(moves), 2 if f.get('juke') else 1 if gain > 22 else 0)
        tT = sim.jukes(keys, (L + 0.4, gap_y), E, 9.1, n, rb, moves, pool) if n else sim.run_to(keys, E, 8.8); sim.path(rb, keys, exact=True); rb.face_hint = 0.0
        tk = fs if gain > 12 else lb; sim.tackle(rb, tT, tk, E, big=True); t_event = tT; sim.seg(rb, tT + 0.05, 'stop')
        if fum:
            rec = sim.D[4]
            if play.get('defender') is not None: rec.num = play['defender']
            rest = sim.loose(tT, (E[0] + 0.3, E[1], 1.2), (-2.2, sg * 3.2, 4.2), 1.25); tR = tT + 1.25
            sim.ev(tT, 'fumble', who=rb, pos=(E[0], E[1], 1.2)); sim.meet(rec, tT + 0.1, tR, (rest[0], rest[1]), exact=T == 'def_td')
            hero, hero_team = rec, 'D'; sim.ev(tR, 'recover', who=rec)
            if T == 'def_td':
                sim.act(rec, 'scoop', tR - 0.3, tR + 0.25); sim.act(rec, 'carry', tR + 0.25, 99); sim.held(tR, rec)
                rk = [(tR, rest[0], rest[1])]; sim.jukes(rk, (rest[0], rest[1]), (-54.5, clamp(rest[1] * 0.4, -20, 20)), 9.3, 2); sim.path(rec, rk, exact=True)
                t_event = sim.cross_x(rk, -50, -1); sim.ev(t_event, 'td', who=rec, team='D')
                for p in sim.O:
                    if p is not rb: sim.pursue(p, tR + 0.3 + (p.i % 3) * 0.12)
                sim.celebrate(rec, 'D', t_event)
            else:
                sim.act(rec, 'dive', tR - 0.3, tR + 0.3); sim.act(rec, 'down', tR + 0.3, 99); sim.spot(tR, (rest[0], rest[1], 0.16)); t_event = tR
                sim.hero, sim.hero_team = rec, 'D'
                for p in sim.O:
                    if p is not rb: sim.pursue(p, tT + 0.4)
                sim.stop_all('O', tR + 0.2); sim.stop_all('D', tR + 0.3)
    sT = sim.air(S, 0.12, (L, 0, 0.3), (qb.home[0] + 0.3, 0, 1.0), spin=4); sim.held(sT, qb); sim.held(tH, rb)
    te = sim.O[7]; sim.path(te, [(S, *te.home), (S + 1.2, te.home[0] + 2.4, te.home[1] - sg)]); sim.act(te, 'block', S + 0.2, tH + 2)
    for oi, di in ((8, 7), (9, 8), (10, 10)):
        wr, d = sim.O[oi], sim.D[di]; sim.seg(wr, S + 0.15, 'cover', who=d, dx=-1.0, dy=0.0); sim.act(wr, 'block', S + 1.2, tH + 3)
        if not any(q['kind'] == 'meet' for q in d.segs): sim.seg(d, S + 0.5, 'hold', x=d.home[0] - 1, y=d.home[1])
        sim.pursue(d, tH + 0.9, slow=0.85)
    for i in (4, 5, 6):
        p = sim.D[i]
        if tfl and p is lb: continue
        sim.path(p, [(S, *p.home), (tH + 0.3, p.home[0] - 1.6, p.home[1] * 0.7 + gap_y * 0.3)]); sim.pursue(p, tH + 0.35 + i * 0.03, lead=0.2)
    if not (gain > 12 and not td and not tfl): sim.pursue(fs, tH + 0.5, lead=0.45)
    sim.focus = dict(qb=qb, target=rb, t_hand=tH)
    if hero is not rb and sim.hero is None: sim.hero, sim.hero_team = hero, hero_team
    return t_event


def _sack(sim):
    play, S = sim.play, sim.S; T, yards = play['type'], play['yards']
    strip = T == 'strip_sack'; scoop = strip and play['result'] == 'td'; ret = clamp(play.get('return_yards') or 30, 5, 90)
    sim.scrimmage('gun', 50 - clamp(play.get('start_yd') or (clamp(100 - ret - 9, 12, 92) if scoop else 55), 1, 99)); L = sim.L
    qb, rb, de, rt = sim.O[0], sim.O[1], sim.D[3], sim.O[6]
    if play.get('defender') is not None: de.num = play['defender']
    tS = S + 2.35; Q = (L - clamp(yards, 5, 11), 0.4)
    sim.path(qb, [(S, *qb.home), (S + 0.25, *qb.home), (S + 1.1, L - 7.4, 0), (S + 1.8, L - 7.0, 0.6), (tS, *Q)], exact=True, face=0.0); sim.act(qb, 'look', S + 1.1, tS - 0.2)
    sim.line_pass(tS + 0.2)
    de.segs = [q for q in de.segs if q['t0'] == 0]; sim.path(de, [(S, *de.home), (S + 0.9, L - 1.6, -6.2), (S + 1.6, L - 5.2, -4.8)])      # speed rush around the edge
    sim.path(rt, [(S, *rt.home), (S + 0.9, L - 2.2, -4.4), (S + 1.6, L - 3.4, -3.6)], face=0.0)
    qb.face_hint = 0.0; sim.tackle(qb, tS, de, Q, big=True, back=True, start=S + 1.6); sim.ev(tS, 'sack', who=de, qb=qb)
    for k, oi in enumerate((8, 9, 10, 7)):
        p = sim.O[oi]; d = (min(58, p.home[0] + 11 + k * 3), p.home[1] * 0.8); sim.path(p, [(S, *p.home), (S + 0.15, *p.home), (S + 0.15 + hyp(d[0] - p.home[0], d[1] - p.home[1]) / 8.4, *d)])
    for oi, di in ((8, 7), (9, 8), (10, 10)): sim.seg(sim.D[di], S + 0.2, 'cover', who=sim.O[oi], dx=0.8, dy=0.0)
    for i in (4, 5, 6):
        p = sim.D[i]; sim.path(p, [(S, *p.home), (S + 1.4, min(58.8, p.home[0] + 3), p.home[1] * 1.1)])
    sim.path(rb, [(S, *rb.home), (S + 0.6, L - 4.4, 1.4)], face=0.0); sim.act(rb, 'block', S + 0.5, tS)
    sT = sim.air(S, 0.3, (L, 0, 0.3), (qb.home[0] + 0.35, 0.1, 1.15), spin=8); sim.held(sT, qb)
    t_event, hero = tS, de
    if strip:
        rec = sim.D[1]; rest = sim.loose(tS, (Q[0], Q[1], 1.5), (-2.6, 2.4, 4.0), 1.2); tR = tS + 1.2
        sim.ev(tS, 'fumble', who=qb, pos=(Q[0], Q[1], 1.5)); sim.meet(rec, tS + 0.1, tR, (rest[0], rest[1]), exact=scoop); sim.ev(tR, 'recover', who=rec)
        if scoop:
            hero = rec; sim.act(rec, 'scoop', tR - 0.3, tR + 0.25); sim.act(rec, 'carry', tR + 0.25, 99); sim.held(tR, rec)
            rk = [(tR, rest[0], rest[1])]; sim.jukes(rk, (rest[0], rest[1]), (-54.5, clamp(rest[1] * 0.4, -18, 18)), 8.8, 1); sim.path(rec, rk, exact=True)
            t_event = sim.cross_x(rk, -50, -1); sim.ev(t_event, 'td', who=rec, team='D')
            for p in sim.O:
                if p is not qb: sim.pursue(p, tR + 0.3 + (p.i % 3) * 0.12)
            sim.celebrate(rec, 'D', t_event)
        else:
            sim.act(rec, 'dive', tR - 0.3, tR + 0.3); sim.act(rec, 'down', tR + 0.3, 99); sim.spot(tR, (rest[0], rest[1], 0.16)); t_event = tR; sim.stop_all('O', tR + 0.2); sim.stop_all('D', tR + 0.3)
    else:
        sim.stop_all('O', tS + 0.3)
        for d in sim.D:
            if d is not de: sim.seg(d, tS + 0.5, 'follow', who=de, r=2.5 + (d.i % 3), a=float(d.i))
        sim.act(de, 'celebrate', tS + 1.3, 99, style=2)
    sim.hero, sim.hero_team = hero, 'D'; sim.focus = dict(qb=qb, target=de)
    return t_event


def _field_goal(sim):
    play, S = sim.play, sim.S; good = play['result'] != 'nogood'; dist = clamp(play['yards'], 18, 66)
    sim.scrimmage('fg', 50 - (dist - 17)); L = sim.L; h, k = sim.O[0], sim.O[1]
    if play.get('kicker') is not None: k.num = play['kicker']
    tK = S + 1.18; spot_p = (L - 7, 0.2, 0.16)
    sim.act(h, 'kneel', 0, tK + 0.7); h.rest = -math.pi / 2
    sim.path(k, [(S, *k.home), (S + 0.35, *k.home), (tK, L - 7.45, -0.25)], exact=True); sim.act(k, 'kick', tK - 0.32, tK + 0.45)
    sim.air(S, 0.42, (L, 0, 0.3), (L - 6.8, 0.25, 0.6), spin=6); sim.spot(S + 0.42, spot_p)
    Tf = clamp(1.25 + dist * 0.017, 1.4, 2.5); end = (66, 0.7 if good else 5.6, 2.4)
    sim.air(tK, Tf, spot_p, end, spin=-14); rest = sim.loose(tK + Tf, end, (6, 0, 0), 1.0); sim.spot(tK + Tf + 1.0, rest)
    t_thru = tK + Tf * (60 - spot_p[0]) / (end[0] - spot_p[0])
    sim.ev(tK, 'kick', who=k, T=Tf); sim.ev(t_thru, 'fg_good' if good else 'fg_miss', who=k, team='O')
    for d in sim.D:
        sim.path(d, [(S, *d.home), (tK, max(L - 3.2, d.home[0] - 4.5), d.home[1] * 0.7)])
        if d.i < 8: sim.act(d, 'block', S + 0.3, tK - 0.2); sim.act(d, 'jump', tK - 0.1, tK + 0.5, h=0.75); sim.act(d, 'reach', tK - 0.15, tK + 0.5)
    for i in range(2, 11): sim.act(sim.O[i], 'block', S + 0.1, tK + 0.6)
    if good:
        sim.act(k, 'celebrate', t_thru + 0.2, 99, style=2); sim.seg(h, t_thru + 0.2, 'follow', who=k, r=1.4, a=0.5)
        for i, p in enumerate(sim.O):
            if i > 1: sim.seg(p, t_thru + 0.5 + i * 0.05, 'follow', who=k, r=2.2 + (i % 3), a=i * 0.7)
    sim.hero, sim.hero_team = k, 'O'; sim.focus = dict(qb=h, target=k, t_kick=tK, t_thru=t_thru)
    return t_thru


def _return(sim):
    play = sim.play; kick = play['type'] == 'kick_return'; td = play['result'] == 'td'; yards = play['yards']
    X0 = clamp(50 - yards, -57, 30) if td else (-45 if kick else -22); end_x = 54.5 if td else min(48, X0 + yards)
    sim.L = X0; sim.no_scrimmage = True
    r = sim.mk('O', 0, 'KR' if kick else 'PR', X0, 0); r.num = play.get('rusher') if play.get('rusher') is not None else 11
    for i in range(1, 11): sim.mk('O', i, 'TE' if i < 6 else 'WR', X0 + 9 + (i % 3) * 5.5, (i - 5.5) * 4.6)       # the return wall
    for i in range(11): sim.mk('D', i, 'LB' if i < 5 else 'S', X0 + (26 if kick else 16) + (i % 4) * 4, (i - 5) * 4.4)   # coverage team
    tC = 1.35
    for p in sim.players: sim.hold(p, 0, *p.home)
    sim.air(0, tC, (X0 + 17, 2.5, 15.5), (X0, 0, 1.7), spin=-12 if kick else 20); sim.held(tC, r)
    sim.act(r, 'catch', tC - 0.4, tC + 0.15, toward=(X0 + 10, 0), over=False, high=True); sim.act(r, 'carry', tC + 0.15, 99)
    sim.ev(tC, 'catch', who=r, pos=(X0, 0, 1.7), field=True); sim.ev(0.05, 'kickoff')
    keys = [(0, X0, 0), (tC, X0, 0), (tC + 0.5, X0 + 2.5, -1.5)]
    n = int(clamp(round((end_x - X0) / 22), 1, 4)); far = (end_x, 16 if td else 9); moves = list(play.get('moves') or [])
    t_end = sim.jukes(keys, (X0 + 2.5, -1.5), far, 9.5, max(n, len(moves)), r, moves, [sim.D[2], sim.D[6], sim.D[4], sim.D[8]]); sim.path(r, keys, exact=True)
    for d in sim.D:
        sim.path(d, [(0, *d.home), (tC, d.home[0] - 9, d.home[1] * 0.8)]); sim.pursue(d, tC, lead=0.35)
    for i, p in enumerate(sim.O):
        if not i: continue
        sim.seg(p, tC - 0.6, 'cover', who=sim.D[i], dx=-1.1, dy=0.0, max=14); sim.act(p, 'block', tC + 0.4, t_end)
    if td: t_event = sim.cross_x(keys, 50) or t_end; sim.ev(t_event, 'td', who=r, team='O'); sim.celebrate(r, 'O', t_event)
    else:
        tk = sim.D[9]; tk.segs = [q for q in tk.segs if q['kind'] != 'pursue']; r.face_hint = 0.0; sim.tackle(r, t_end, tk, far, big=True); t_event = t_end; sim.seg(r, t_end + 0.05, 'stop')
    sim.hero, sim.hero_team = r, 'O'; sim.focus = dict(qb=r, target=r, t_catch=tC, catch_pt=(X0, 0, 1.7))
    return t_event
