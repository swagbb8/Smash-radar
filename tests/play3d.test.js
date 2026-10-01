import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlay, describePlay, PLAY_TYPES } from '../public/play3d/parser.js';
import { buildPlay } from '../public/play3d/sim.js';

test('play interpreter: plain English -> structured play', () => {
  const p = parsePlay('QB throws a 50-yard touchdown to WR #11');
  assert.equal(p.type, 'pass_td'); assert.equal(p.yards, 50); assert.equal(p.target, 11); assert.equal(p.result, 'td');
  assert.deepEqual(describePlay(p).slice(0, 2), [['PLAY TYPE', 'PASSING TOUCHDOWN'], ['QB ACTION', 'DROPBACK']]);
  assert.equal(parsePlay('Interception returned 60 yards for a touchdown.').type, 'pick_six');
  assert.equal(parsePlay('QB escapes a sack and throws a 30-yard touchdown.').flags.scramble, true);
  assert.equal(parsePlay('QB escapes a sack and throws a 30-yard touchdown.').type, 'pass_td');
  assert.equal(parsePlay('48-yard field goal is no good, wide right').result, 'nogood');
  assert.equal(parsePlay('Strip sack returned 30 yards for a touchdown').result, 'td');
  assert.equal(parsePlay('Luther Burden III 8 Yd pass from Case Keenum (Cairo Santos Kick)').yards, 8);
  assert.equal(parsePlay('Cairo Santos 29 Yd Field Goal').type, 'field_goal');
  assert.equal(parsePlay('anything', { type: 'sack' }).type, 'sack');
});

test('simulator: every play type runs to the end with sane positions and the right result', () => {
  const want = { pass_td: 'td', pick_six: 'td', breakaway: 'td', hail_mary: 'td', def_td: 'td', kick_return: null, field_goal: 'fg_good', sack: 'sack', interception: 'int', tfl: 'tfl', fumble: 'recover', strip_sack: 'recover' };
  for (const type of Object.keys(PLAY_TYPES)) {
    const sim = buildPlay(parsePlay('', { type })); sim.seek(sim.duration);
    assert.equal(sim.players.length, 22, type);
    for (const p of sim.players) { assert.ok(Number.isFinite(p.x + p.y + p.face), `${type}: player position`); assert.ok(Math.abs(p.x) < 63 && Math.abs(p.y) < 32, `${type}: player on the field`); }
    assert.ok(sim.ball.pos.every(Number.isFinite), `${type}: ball`); assert.ok(sim.duration > 3 && sim.duration < 18, `${type}: ${sim.duration}s`);
    if (want[type]) assert.ok(sim.events.some((e) => e.type === want[type]), `${type} should produce ${want[type]}`);
  }
});

test('simulator: the ball obeys gravity and a touchdown pass ends in the end zone', () => {
  const sim = buildPlay(parsePlay('45-yard touchdown pass')); const fl = sim.ballSegs.filter((s) => s.kind === 'air').pop();
  const apex = fl.p0[2] + fl.v[2] ** 2 / (2 * 10.72); assert.ok(apex > 3 && apex < 25, `apex ${apex}`);
  sim.seek(sim.tEvent + 0.1); assert.ok(sim.carrier && sim.carrier.x >= 50, 'carrier crossed the goal line');
  sim.seek(1.0); sim.seek(0.5); assert.ok(Math.abs(sim.t - 0.5) < 0.02, 'seek backwards re-simulates');
});
