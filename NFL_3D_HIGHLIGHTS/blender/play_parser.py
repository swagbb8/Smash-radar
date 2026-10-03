"""Play input layer.

1. parse_text("QB rolls left, avoids a defender, throws a 35-yard pass ... and scores")  ->  play JSON (the file format)
2. load_play(path) / normalize(json)                                                   ->  the dict the simulator consumes

The JSON format is documented in README.md. Everything is optional except play_type or description.
"""
import json, re
from utils import clamp, color

ROUTES = ['post', 'corner', 'slant', 'fade', 'go', 'out', 'in', 'comeback', 'curl', 'drag', 'seam', 'wheel', 'screen', 'crossing', 'cross', 'dig', 'streak', 'hitch']
MOVES = {'stiff_arm': r'stiff[- ]?arm', 'spin': r'\bspin', 'hurdle': r'hurdle|leaps? over', 'broken_tackle': r'breaks? (?:a |one |two |three |the )?tackles?|broken tackle|runs? through|shakes? off|trucks?'}
DEFAULT_TEAMS = {
    'HOME': {'name': 'Sharks', 'abbr': 'SHK', 'primary': '#0b6e7a', 'secondary': '#ffb81c'},
    'AWAY': {'name': 'Wolves', 'abbr': 'WLV', 'primary': '#8a1538', 'secondary': '#c9ced6'},
}
DEFAULT_YARDS = {'pass_td': 30, 'long_pass': 35, 'short_pass': 9, 'incomplete': 18, 'interception': 18, 'pick_six': 45, 'fumble': 8, 'sack': 8, 'strip_sack': 9, 'tfl': 3, 'run': 14, 'breakaway': 55,
                 'screen': 22, 'hail_mary': 48, 'two_point': 2, 'field_goal': 42, 'punt_return': 65, 'kick_return': 98, 'def_td': 35, 'one_handed': 24, 'jump_ball': 28, 'sideline_catch': 17}
LABELS = {'pass_td': 'Passing touchdown', 'long_pass': 'Deep pass', 'short_pass': 'Short pass', 'incomplete': 'Incomplete pass', 'interception': 'Interception', 'pick_six': 'Pick-six', 'fumble': 'Fumble',
          'sack': 'Sack', 'strip_sack': 'Strip sack', 'tfl': 'Tackle for loss', 'run': 'Run', 'breakaway': 'Long run', 'screen': 'Screen pass', 'hail_mary': 'Hail Mary', 'two_point': 'Two-point conversion',
          'field_goal': 'Field goal', 'punt_return': 'Punt return', 'kick_return': 'Kickoff return', 'def_td': 'Defensive touchdown', 'one_handed': 'One-handed catch', 'jump_ball': 'Jump ball', 'sideline_catch': 'Sideline catch'}
DEFENSE_HERO = {'interception', 'pick_six', 'def_td', 'sack', 'strip_sack', 'tfl', 'incomplete'}


def _has(t, pat): return re.search(pat, t) is not None


def parse_text(text, teams=None):
    """Natural language -> play JSON (same structure as the files in plays/)."""
    raw = (text or '').strip(); t = f" {raw.lower().replace('’', chr(39))} "
    js = {'description': raw, 'play_type': None, 'result': None}
    td = _has(t, r"touchdown|\btd\b|scores?\b|to the house|into the end ?zone|pick[- ]?six|house call|walks? in|takes? it all the way")
    no_good = _has(t, r'no good|miss(?:es|ed)?\b|wide (?:left|right)|blocked')
    yd = [int(x) for x in re.findall(r'(\d{1,3})\s*[- ]?\s*(?:yards?|yds?|yarder)\b', t)]
    m = re.search(r'return(?:ed|s|ing)?(?: it)?(?: for)? (\d{1,3})\s*[- ]?(?:yards?|yds?)', t) or re.search(r'(\d{1,3})\s*[- ]?(?:yards?|yds?)(?: [a-z]+){0,3} return', t)
    ret = int(m.group(1)) if m else None
    side = 'left' if _has(t, r'\b(?:to the |rolls? |on the )?left\b') else 'right' if _has(t, r'\bright\b') else 'middle' if _has(t, r'\bmiddle\b|up the gut|\bseam\b') else None
    route = next((r for r in ROUTES if _has(t, rf'\b{r}\b(?! (?:of|bounds))')), None)
    route = {'streak': 'go', 'crossing': 'cross', 'hitch': 'curl'}.get(route, route)
    scramble = _has(t, r'scrambl|escapes?|evades?|avoids? (?:a |the )?(?:sack|rush|pressure|defender|tackler)|rolls? (?:out|left|right)|buys? time|breaks? (?:free|away) from')
    moves = [k for k, pat in MOVES.items() if _has(t, pat)]
    juke = _has(t, r"juke|cut ?back|cuts? (?:back|inside|outside)|makes? (?:a |one |two )?(?:man|guy|defender)s? miss|weaves?")
    nums = {}
    for role, n in re.findall(r'(qb|quarterback|wr|receiver|rb|running back|te|tight end|cb|corner(?:back)?|safety|lb|linebacker|kicker|de|dt|returner)?\s*#\s?(\d{1,2})', t):
        key = 'quarterback' if re.match(r'qb|quarterback', role or '') else 'defender' if re.match(r'cb|corner|safety|lb|linebacker|de|dt', role or '') else 'kicker' if role == 'kicker' else \
            'runner' if re.match(r'rb|running|returner', role or '') else 'receiver'
        nums.setdefault(key, int(n))
    # ---- play type, most specific first
    pt = None
    if _has(t, r'strip[- ]?sack') or (_has(t, r'sack') and _has(t, r'fumble|strip|ball (?:comes|pops) (?:out|loose)')): pt = 'strip_sack'
    elif _has(t, r'pick[- ]?six') or (_has(t, r"intercept|picked off|picks? (?:it )?off") and td): pt = 'pick_six'
    elif _has(t, r"intercept|picked off|picks? (?:it )?off|\bint\b"): pt = 'interception'
    elif _has(t, r'field goal|\bfg\b'): pt = 'field_goal'
    elif _has(t, r'punt return|returns? (?:the |a )?punt|punt (?:is )?returned'): pt = 'punt_return'
    elif _has(t, r'kick(?:off)? return|returns? (?:the |a )?kick(?:off)?|kickoff (?:is )?returned'): pt = 'kick_return'
    elif _has(t, r'hail mary'): pt = 'hail_mary'
    elif _has(t, r'two[- ]point|2[- ]?pt|2[- ]point'): pt = 'two_point'
    elif _has(t, r'(?:scoop|fumble).{0,40}(?:return|score|touchdown|td)|defensive (?:touchdown|td)|scoop and score') and td: pt = 'def_td'
    elif _has(t, r'sack(?:s|ed)?\b') and not (scramble and _has(t, r'throw|pass|finds?|hits?|connect')): pt = 'sack'
    elif _has(t, r'fumble|coughs? it up|ball (?:comes|pops) (?:out|loose)'): pt = 'fumble'
    elif _has(t, r'tackle[d]? for (?:a )?loss|\btfl\b|stuffed|dropped in the backfield|loss of'): pt = 'tfl'
    elif _has(t, r'incomplete|incompletion|broken up|breaks? (?:it )?up|knocked (?:down|away)|drops? (?:the|it)|overthrow'): pt = 'incomplete'
    elif _has(t, r'screen'): pt = 'screen'
    elif _has(t, r'throw|pass|toss|finds?|hits?|connects?|catch|reception|drops? back|dime|bomb|lob|fires?|slings?|air it out|deep ball|quarterback|\bqb\b|receiver|\bwr\b') and \
            not _has(t, r'handoff|hand[- ]off|\brush|carries|\bruns? (?:for|up|it|\d)|takes? the handoff'):
        y = yd[0] if yd else 20
        pt = 'one_handed' if _has(t, r'one[- ]hand') else 'jump_ball' if _has(t, r'jump ball') else 'sideline_catch' if _has(t, r'sideline|toe[- ]?tap') and not td else 'pass_td' if td else 'long_pass' if y >= 20 else 'short_pass'
    elif _has(t, r'run|rush|handoff|hand[- ]off|carr(?:y|ies)|breakaway|takes it|up the middle|sweep|draw|sneak|scamper|rumble|dive|toss'):
        y = yd[0] if yd else 15
        pt = 'breakaway' if (_has(t, r'breakaway|break(?:s)? (?:away|free|loose)|untouched|to the house|gone') or (td and y >= 20)) else 'run'
    if pt is None: pt = 'pass_td' if td else 'long_pass'
    yards = yd[0] if yd else DEFAULT_YARDS[pt]
    js['play_type'] = pt; js['yards'] = yards
    js['result'] = ('no_good' if no_good else 'good') if pt in ('field_goal', 'two_point') else 'touchdown' if (td or pt in ('pass_td', 'pick_six', 'def_td', 'hail_mary', 'breakaway')) else \
        {'interception': 'interception', 'incomplete': 'incomplete', 'sack': 'sack', 'strip_sack': 'fumble', 'fumble': 'fumble', 'sideline_catch': 'out_of_bounds'}.get(pt, 'tackle')
    if ret and pt in ('interception', 'pick_six', 'def_td', 'fumble', 'strip_sack'): js['return_yards'] = ret
    pass_like = pt in ('pass_td', 'long_pass', 'short_pass', 'incomplete', 'interception', 'pick_six', 'screen', 'hail_mary', 'one_handed', 'jump_ball', 'sideline_catch') or (pt == 'two_point' and not _has(t, r'\brun|rush|sneak'))
    if pass_like:
        js['quarterback'] = {'team': 'HOME', 'number': nums.get('quarterback', 12), 'scramble': bool(scramble)}
        js['receiver'] = {'team': 'HOME', 'number': nums.get('receiver', 11), 'route': route or ('post' if yards >= 30 else None), 'side': side}
        js['defender'] = {'team': 'AWAY', 'number': nums.get('defender', 24), 'coverage': 'man', 'bites': _has(t, r'bites?|play[- ]action|pump fake|fooled|frozen') or (pt == 'pass_td' and yards >= 40)}
        air = re.search(r'(\d{1,2})\s*[- ]?(?:yards?|yds?) (?:in the air|downfield)', t)
        js['ball'] = {'target': 'receiver', 'air_yards': int(air.group(1)) if air else None}
        js['catch'] = {'one_handed': _has(t, r'one[- ]hand'), 'jump_ball': _has(t, r'jump ball|leaps?|goes up|high[- ]points?|contested|over (?:a|the) defender'),
                       'sideline': _has(t, r'sideline|toe[- ]?tap|tiptoe'), 'over_shoulder': _has(t, r'over[- ]the[- ]shoulder|in stride|basket catch')}
    elif pt == 'field_goal': js['kicker'] = {'team': 'HOME', 'number': nums.get('kicker', 3)}
    elif pt in ('sack', 'strip_sack', 'tfl'): js['defender'] = {'team': 'HOME', 'number': nums.get('defender', 99)}
    else: js['runner'] = {'team': 'HOME', 'number': nums.get('runner', nums.get('receiver', 28)), 'direction': side}
    if pt == 'two_point': js['mode'] = 'pass' if pass_like else 'run'
    if moves or juke: js['moves'] = moves or ['juke']
    m = re.search(r'(?:from|at|on) the (\d{1,2})[- ]yard line', t)
    if m: js['field'] = {'yard_line': int(m.group(1))}
    js['teams'] = teams or DEFAULT_TEAMS
    return js


def _type_from(pt, result, yards, js):
    """Free-form play_type strings ('deep_pass_touchdown', 'long run', ...) -> one of the simulator's types."""
    s = (pt or '').lower().replace('-', '_').replace(' ', '_'); td = 'touchdown' in (result or '') or 'touchdown' in s or s.endswith('_td')
    if s in LABELS: return s
    if 'strip' in s or ('sack' in s and 'fumble' in s): return 'strip_sack'
    if 'pick' in s or ('interception' in s and td): return 'pick_six'
    if 'interception' in s or result == 'interception': return 'interception'
    if 'sack' in s or result == 'sack': return 'sack'
    if 'field_goal' in s or s == 'fg': return 'field_goal'
    if 'punt' in s: return 'punt_return'
    if 'kick' in s: return 'kick_return'
    if 'two_point' in s or '2pt' in s or '2_point' in s: return 'two_point'
    if 'hail' in s: return 'hail_mary'
    if 'screen' in s: return 'screen'
    if 'incomplete' in s or result == 'incomplete': return 'incomplete'
    if 'fumble' in s or result == 'fumble': return 'def_td' if td else 'fumble'
    if 'loss' in s or s == 'tfl': return 'tfl'
    if 'run' in s or 'rush' in s or js.get('runner'): return 'breakaway' if ('long' in s or 'breakaway' in s or (td and (yards or 0) >= 20)) else 'run'
    c = js.get('catch') or {}
    if c.get('one_handed') or 'one_hand' in s: return 'one_handed'
    if 'jump' in s: return 'jump_ball'
    if 'sideline' in s: return 'sideline_catch'
    if td: return 'pass_td'
    return 'long_pass' if ('deep' in s or 'long' in s or (yards or 0) >= 20) else 'short_pass'


def _team(d, fallback):
    d = dict(fallback, **(d or {})); p = color(d.get('primary'), fallback['primary']); s = color(d.get('secondary'), fallback['secondary'])
    name = d.get('name') or fallback['name']
    return {'name': name, 'abbr': (d.get('abbr') or name[:3]).upper()[:4], 'primary': p, 'secondary': s, 'helmet': color(d.get('helmet'), p), 'jersey': color(d.get('jersey'), p),
            'pants': color(d.get('pants'), '#f2f2f2'), 'socks': color(d.get('socks'), p), 'stripe': d.get('stripe', 'single'), 'score': int(d.get('score', 0))}


def normalize(js):
    """Play JSON -> the flat dict simulation.build_play() wants (plus presentation settings)."""
    if js.get('description') and not js.get('play_type'): js = dict(parse_text(js['description'], js.get('teams')), **{k: v for k, v in js.items() if v is not None})
    result = (js.get('result') or '').lower().replace(' ', '_'); yards = js.get('yards')
    T = _type_from(js.get('play_type'), result, yards, js)
    qb, rc, df, rn, kk, ball, catch = (js.get(k) or {} for k in ('quarterback', 'receiver', 'defender', 'runner', 'kicker', 'ball', 'catch'))
    if yards is None: yards = kk.get('distance') or DEFAULT_YARDS[T]
    yards = int(clamp(yards, 1, 105 if T == 'kick_return' else 66 if T == 'field_goal' else 99))
    td = 'touchdown' in result or T in ('pass_td', 'pick_six', 'def_td', 'hail_mary', 'breakaway')
    res = ('nogood' if 'no' in result or 'miss' in result else 'good') if T in ('field_goal', 'two_point') else 'td' if td else \
        {'interception': 'int', 'incomplete': 'incomplete', 'sack': 'sack', 'strip_sack': 'fumble', 'fumble': 'fumble'}.get(T, 'tackle')
    side = rc.get('side') or rn.get('direction')
    if side is None and isinstance(rc.get('position'), (list, tuple)) and rc['position']: side = 'right' if rc['position'][0] > 0 else 'left'
    moves = [m for m in (js.get('moves') or rn.get('moves') or []) if m in ('stiff_arm', 'spin', 'hurdle', 'broken_tackle')]
    route = rc.get('route'); route = {'crossing': 'cross', 'crossing_route': 'cross', 'streak': 'go'}.get(route, route)
    teams = js.get('teams') or {}
    home, away = _team(teams.get('HOME') or teams.get('home'), DEFAULT_TEAMS['HOME']), _team(teams.get('AWAY') or teams.get('away'), DEFAULT_TEAMS['AWAY'])
    other = lambda k: 'AWAY' if k == 'HOME' else 'HOME'
    hero_side = ((df if T in DEFENSE_HERO else qb or rn or kk or rc).get('team') or 'HOME').upper()      # the team making the highlight
    offense = (js.get('offense') or (other(hero_side) if T in DEFENSE_HERO else hero_side)).upper()
    sb = js.get('scoreboard') or {}
    return {
        'type': T, 'label': LABELS[T], 'desc': js.get('description') or LABELS[T], 'yards': yards, 'result': res, 'dir': side, 'route': route, 'air': ball.get('air_yards'),
        'start_yd': (js.get('field') or {}).get('yard_line'), 'return_yards': js.get('return_yards'), 'mode': js.get('mode') or ('run' if rn else 'pass'),
        'passer': qb.get('number'), 'target': rc.get('number'), 'rusher': rn.get('number'), 'kicker': kk.get('number'), 'defender': df.get('number'),
        'flags': {'scramble': bool(qb.get('scramble')), 'one_hand': bool(catch.get('one_handed')) or T == 'one_handed', 'jump_ball': bool(catch.get('jump_ball')) or T in ('jump_ball', 'hail_mary'),
                  'sideline': bool(catch.get('sideline')) or T == 'sideline_catch', 'over_shoulder': bool(catch.get('over_shoulder')), 'bite': bool(df.get('bites')), 'juke': 'juke' in (js.get('moves') or [])},
        'moves': moves, 'timing': {'throw_time': ball.get('throw_time'), 'catch_time': ball.get('catch_time')}, 'spin_rate': ball.get('spin_rate'), 'route_speed': rc.get('speed'),
        'duration': js.get('duration'), 'teams': {'HOME': home, 'AWAY': away}, 'offense': offense,
        'hero_is_defense': T in DEFENSE_HERO,
        'scoreboard': {'quarter': sb.get('quarter', 'Q1'), 'clock': sb.get('clock', '8:47'), 'down': sb.get('down'), 'home': int(sb.get('home', home['score'])), 'away': int(sb.get('away', away['score']))},
        'names': js.get('player_names') or {}, 'lighting': (js.get('lighting') or 'PRIMETIME').upper(), 'weather': (js.get('weather') or 'none').lower(), 'camera_style': js.get('camera_style', 'cinematic'),
        'replay': js.get('replay', True), 'effects': js.get('effects') or {},
    }


def load_play(path):
    with open(path) as f: return normalize(json.load(f))
