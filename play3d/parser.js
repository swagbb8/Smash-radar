// Play interpreter: plain-English (or ESPN play-by-play) -> structured play data the simulator can act out.
// Pure functions, no DOM — also runs in Node for tests.

export const PLAY_TYPES = {
  pass_td: 'Passing touchdown', long_pass: 'Long pass', short_pass: 'Short pass', interception: 'Interception', pick_six: 'Pick-six',
  fumble: 'Fumble', sack: 'Sack', strip_sack: 'Strip sack', tfl: 'Tackle for loss', run: 'Big run', breakaway: 'Breakaway run',
  screen: 'Screen pass', hail_mary: 'Hail Mary', two_point: 'Two-point conversion', field_goal: 'Field goal',
  punt_return: 'Punt return', kick_return: 'Kick return', def_td: 'Defensive touchdown', one_handed: 'One-handed catch',
  jump_ball: 'Jump ball', sideline_catch: 'Sideline catch',
};

const num = (m) => (m ? parseInt(m, 10) : null);
const has = (t, re) => re.test(t);

/** Turn a description into a structured play. `hint` can force the type / number / etc. from the UI. */
export function parsePlay(text, hint = {}) {
  const raw = String(text || '').trim();
  const t = ` ${raw.toLowerCase().replace(/[’']/g, "'")} `;
  const p = {
    desc: raw, type: null, yards: null, air: null, dir: null, route: null, result: null, startYd: null,
    passer: null, target: null, rusher: null, defender: null, kicker: null,
    flags: { scramble: false, oneHand: false, jumpBall: false, sideline: false, overShoulder: false, bite: false, juke: false, hurdle: false, stiffArm: false, spin: false },
  };

  // ---- ESPN scoring-play shorthand: "Luther Burden III 8 Yd pass from Case Keenum (kick)"
  const core = raw.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '');
  let m;
  if ((m = core.match(/^(.+?) (\d+) Yd pass from (.+)$/i))) Object.assign(p, { type: 'pass_td', yards: +m[2], result: 'td', names: { target: m[1], passer: m[3].trim() } });
  else if ((m = core.match(/^(.+?) (\d+) Yd Field Goal/i))) Object.assign(p, { type: 'field_goal', yards: +m[2], result: 'good', names: { kicker: m[1] } });
  else if ((m = core.match(/^(.+?) (\d+) Yd Interception Return/i))) Object.assign(p, { type: 'pick_six', yards: +m[2], result: 'td', names: { defender: m[1] } });
  else if ((m = core.match(/^(.+?) (\d+) Yd Fumble Return/i))) Object.assign(p, { type: 'def_td', yards: +m[2], result: 'td', names: { defender: m[1] } });
  else if ((m = core.match(/^(.+?) (\d+) Yd Punt Return/i))) Object.assign(p, { type: 'punt_return', yards: +m[2], result: 'td', names: { rusher: m[1] } });
  else if ((m = core.match(/^(.+?) (\d+) Yd Kickoff Return/i))) Object.assign(p, { type: 'kick_return', yards: +m[2], result: 'td', names: { rusher: m[1] } });
  else if ((m = core.match(/^(.+?) (\d+) Yd (?:Run|Rush)/i))) Object.assign(p, { type: +m[2] >= 20 ? 'breakaway' : 'run', yards: +m[2], result: 'td', names: { rusher: m[1] } });

  // ---- numbers
  const yd = [...t.matchAll(/(\d{1,3})\s*[- ]?\s*(?:yards?|yds?|yarder)\b/g)].map((x) => +x[1]);
  if (p.yards == null && yd.length) p.yards = yd[0];
  const ret = t.match(/return(?:ed|s|ing)?(?: it)?(?: for)? (\d{1,3})\s*[- ]?(?:yards?|yds?)/) || t.match(/(\d{1,3})\s*[- ]?(?:yards?|yds?)(?: [a-z]+){0,3} return/);
  const nums = [...t.matchAll(/(qb|quarterback|wr|receiver|rb|running back|te|tight end|cb|corner(?:back)?|safety|lb|linebacker|kicker|de|dt)?\s*#\s?(\d{1,2})/g)];
  for (const [, role, n] of nums) {
    if (/qb|quarterback/.test(role || '')) p.passer = +n; else if (/wr|receiver|te|tight/.test(role || '')) p.target = +n;
    else if (/rb|running/.test(role || '')) p.rusher = +n; else if (/cb|corner|safety|lb|linebacker|de|dt/.test(role || '')) p.defender = +n;
    else if (/kicker/.test(role || '')) p.kicker = +n; else if (p.target == null) p.target = +n;
  }
  if ((m = t.match(/(?:from|at) the (\d{1,2})[- ]yard line/))) p.startYd = +m[1];

  // ---- direction / route / flavor
  p.dir = has(t, /\b(left|left side)\b/) ? 'left' : has(t, /\b(right|right side)\b/) ? 'right' : has(t, /\b(middle|over the middle|up the gut|seam)\b/) ? 'middle' : null;
  p.route = (t.match(/\b(post|corner|slant|fade|go route|go|streak|out route|out|comeback|crosser|crossing|drag|seam|wheel|curl|hitch)\b/) || [])[1] || null;
  if (p.route === 'go route' || p.route === 'streak') p.route = 'go';
  if (p.route === 'out route') p.route = 'out';
  if (p.route === 'crossing') p.route = 'crosser';
  const f = p.flags;
  f.scramble = has(t, /scrambl|escapes?|evades?|breaks? (?:free|away) from|rolls? out|avoids? (?:the )?(?:sack|rush|pressure)|buys? time/);
  f.oneHand = has(t, /one[- ]hand/);
  f.jumpBall = has(t, /jump ball|leaps?|goes up|high[- ]points?|moss|contested/);
  f.sideline = has(t, /sideline|toe[- ]?tap|tiptoe|along the boundary/);
  f.overShoulder = has(t, /over[- ]the[- ]shoulder|in stride|basket catch/);
  f.bite = has(t, /bites?|play[- ]action|pump fake|fooled|frozen/);
  f.juke = has(t, /juke|jukes|cut ?back|cuts? (?:back|inside|outside)|makes? (?:a |one |two )?(?:man|guy|defender)s? miss|breaks? (?:a |two |three )?tackles?|shakes?/);
  f.hurdle = has(t, /hurdle/); f.stiffArm = has(t, /stiff[- ]?arm/); f.spin = has(t, /spin/);

  // ---- result
  const td = has(t, /touchdown|\btd\b|scores?\b|to the house|into the end ?zone|pick[- ]?six|house call|walks? in/);
  const noGood = has(t, /no good|miss(?:es|ed)?\b|wide (?:left|right)|blocked/);

  // ---- type (most specific first)
  if (!p.type) {
    if (has(t, /strip[- ]?sack/) || (has(t, /sack/) && has(t, /fumble|strip|ball (?:comes|pops) (?:out|loose)/))) p.type = 'strip_sack';
    else if (has(t, /pick[- ]?six/) || (has(t, /intercept|picked off|picks? (?:it )?off/) && td)) p.type = 'pick_six';
    else if (has(t, /intercept|picked off|picks? (?:it )?off|\bint\b/)) p.type = 'interception';
    else if (has(t, /field goal|\bfg\b|kicks? (?:a |the )?\d+/)) p.type = 'field_goal';
    else if (has(t, /punt return|returns? (?:the |a )?punt|punt (?:is )?returned/)) p.type = 'punt_return';
    else if (has(t, /kick(?:off)? return|returns? (?:the |a )?kick(?:off)?|kickoff (?:is )?returned/)) p.type = 'kick_return';
    else if (has(t, /hail mary/)) p.type = 'hail_mary';
    else if (has(t, /two[- ]point|2[- ]?pt|2[- ]point/)) p.type = 'two_point';
    else if (has(t, /(?:scoop|fumble).{0,40}(?:return|score|touchdown|td)|defensive (?:touchdown|td)|scoop and score/) && td) p.type = 'def_td';
    else if (has(t, /sack(?:s|ed)?\b/) && !f.scramble) p.type = 'sack';
    else if (has(t, /sack(?:s|ed)?\b/) && f.scramble && !has(t, /throw|pass|finds?|hits?|connect/)) p.type = 'sack';
    else if (has(t, /fumble|coughs? it up|ball (?:comes|pops) (?:out|loose)|strips?/)) p.type = 'fumble';
    else if (has(t, /tackle[d]? for (?:a )?loss|\btfl\b|stuffed|dropped in the backfield|loss of/)) p.type = 'tfl';
    else if (has(t, /screen/)) p.type = 'screen';
    else if (f.oneHand && !has(t, /\brun\b|rush|handoff/)) p.type = 'one_handed';
    else if (has(t, /jump ball/)) p.type = 'jump_ball';
    else if (f.sideline && has(t, /catch|grab|snag|haul|toe/)) p.type = 'sideline_catch';
    else if (has(t, /throw|pass|toss|finds?|hits?|connects?|catch|reception|drops? back|dime|bomb|lob|fires?|slings?|air it out|deep ball|qb|quarterback|receiver|\bwr\b/) && !has(t, /handoff|hand[- ]off|\brush|carries|\bruns? (?:for|up|it|\d)|takes? the handoff/)) {
      const y = p.yards ?? 20;
      p.type = td ? 'pass_td' : y >= 20 ? 'long_pass' : 'short_pass';
    } else if (has(t, /run|rush|handoff|hand[- ]off|carr(?:y|ies)|breakaway|takes it|up the middle|sweep|draw|sneak|scamper|rumble|dive|toss/)) {
      const y = p.yards ?? 15;
      p.type = has(t, /breakaway|break(?:s)? (?:away|free|loose)|untouched|to the house|gone/) || (td && y >= 20) ? 'breakaway' : 'run';
    }
  }
  if (hint.type && PLAY_TYPES[hint.type]) p.type = hint.type;
  if (!p.type) p.type = td ? 'pass_td' : 'long_pass';

  // ---- defaults per type
  const T = p.type;
  const dflt = { pass_td: 30, long_pass: 35, short_pass: 9, interception: 18, pick_six: 45, fumble: 8, sack: 8, strip_sack: 9, tfl: 3, run: 14, breakaway: 55, screen: 22, hail_mary: 48, two_point: 2, field_goal: 42, punt_return: 65, kick_return: 98, def_td: 35, one_handed: 24, jump_ball: 28, sideline_catch: 17 };
  if (p.yards == null) p.yards = dflt[T];
  p.yards = Math.max(1, Math.min(T === 'kick_return' ? 105 : T === 'field_goal' ? 66 : 99, p.yards));
  if (ret && ['interception', 'pick_six', 'def_td', 'fumble', 'strip_sack'].includes(T)) p.returnYards = Math.min(99, +ret[1]);
  if (!p.result) {
    p.result = { pass_td: 'td', pick_six: 'td', def_td: 'td', hail_mary: 'td', breakaway: 'td', two_point: noGood ? 'nogood' : 'good', field_goal: noGood ? 'nogood' : 'good',
      interception: 'int', fumble: 'fumble', sack: 'sack', strip_sack: 'fumble', tfl: 'tackle' }[T] || (td ? 'td' : 'tackle');
  }
  if (['one_handed', 'jump_ball', 'sideline_catch', 'screen', 'run', 'long_pass', 'short_pass', 'punt_return', 'kick_return'].includes(T) && td) p.result = 'td';
  if (T === 'strip_sack' && td) p.result = 'td';
  if (T === 'fumble' && td && has(t, /return|scoop|defense|defensive|recover/)) { p.type = 'def_td'; p.result = 'td'; }
  if (T === 'one_handed') f.oneHand = true;
  if (T === 'jump_ball' || T === 'hail_mary') f.jumpBall = true;
  if (T === 'sideline_catch') f.sideline = true;
  if (T === 'pass_td' && p.yards >= 35 && !p.route) { p.route = 'post'; if (!has(t, /bites?/)) f.bite = f.bite || p.yards >= 40; }
  if ((m = t.match(/(\d{1,2})\s*[- ]?(?:yards?|yds?) (?:in the air|downfield)/))) p.air = +m[1];
  for (const k of ['passer', 'target', 'rusher', 'defender', 'kicker']) if (hint[k] != null && hint[k] !== '') p[k] = +hint[k];
  if (hint.number != null && hint.number !== '') {           // "Player number" box = the star of the play
    const n = +hint.number;
    if (['run', 'breakaway', 'tfl', 'fumble', 'punt_return', 'kick_return'].includes(T)) p.rusher = p.rusher ?? n;
    else if (['interception', 'pick_six', 'def_td', 'sack', 'strip_sack'].includes(T)) p.defender = p.defender ?? n;
    else if (T === 'field_goal') p.kicker = p.kicker ?? n; else p.target = p.target ?? n;
  }
  if (hint.dir) p.dir = hint.dir;
  if (hint.startYd) p.startYd = +hint.startYd;
  return p;
}

/** The "PLAY TYPE = PASSING TD / RECEIVER = WR #11 ..." readout. */
export function describePlay(p) {
  const rows = [['PLAY TYPE', (PLAY_TYPES[p.type] || p.type).toUpperCase()]];
  const pass = ['pass_td', 'long_pass', 'short_pass', 'screen', 'hail_mary', 'one_handed', 'jump_ball', 'sideline_catch', 'interception', 'pick_six'].includes(p.type) || (p.type === 'two_point' && p.mode !== 'run');
  if (pass) {
    rows.push(['QB ACTION', p.flags.scramble ? 'SCRAMBLE' : p.type === 'screen' ? 'DEEP DROP, DUMP OFF' : 'DROPBACK']);
    rows.push(['RECEIVER', `WR${p.target != null ? ` #${p.target}` : ''}`]);
    rows.push(['ROUTE', (p.route || (p.yards >= 25 ? 'deep' : p.yards >= 12 ? 'intermediate' : 'short')).toUpperCase()]);
    rows.push(['PASS DISTANCE', `${p.yards} YARDS`]);
  } else if (p.type === 'field_goal') rows.push(['KICK DISTANCE', `${p.yards} YARDS`]);
  else if (['punt_return', 'kick_return'].includes(p.type)) rows.push(['RETURN', `${p.yards} YARDS`]);
  else if (['sack', 'strip_sack'].includes(p.type)) rows.push(['LOSS', `${p.yards} YARDS`]);
  else rows.push(['BALL CARRIER', `RB${p.rusher != null ? ` #${p.rusher}` : ''}`], ['GAIN', `${p.type === 'tfl' ? '-' : ''}${p.yards} YARDS`]);
  if (p.dir) rows.push(['SIDE', p.dir.toUpperCase()]);
  if (p.returnYards) rows.push(['RETURN', `${p.returnYards} YARDS`]);
  const fl = Object.entries(p.flags).filter(([, v]) => v).map(([k]) => k.replace(/[A-Z]/g, (c) => ` ${c}`).toUpperCase());
  if (fl.length) rows.push(['EXTRAS', fl.join(', ')]);
  rows.push(['RESULT', { td: 'TOUCHDOWN', tackle: 'TACKLED', int: 'INTERCEPTION', fumble: 'FUMBLE', sack: 'SACK', good: 'GOOD', nogood: 'NO GOOD' }[p.result] || String(p.result).toUpperCase()]);
  return rows;
}
