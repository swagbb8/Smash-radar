import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent } from '../src/wzdx.js';

const feed = { name: 'Iowa DOT/idot', stateName: 'Iowa' };
const now = Date.parse('2026-10-01T15:00:00Z');
const v4 = {
  type: 'Feature', id: 'abc',
  properties: {
    core_details: { event_type: 'work-zone', data_source_id: 'x', road_names: ['I-80'], direction: 'eastbound', description: 'Bridge deck repair. Right lane closed.' },
    start_date: '2026-09-20T12:00:00Z', end_date: '2026-10-10T23:00:00Z', vehicle_impact: 'some-lanes-closed',
    beginning_cross_street: 'Exit 137', ending_cross_street: 'Exit 141',
    lanes: [{ order: 1, type: 'general', status: 'open' }, { order: 2, type: 'general', status: 'closed' }],
  },
  geometry: { type: 'LineString', coordinates: [[-93.6, 41.6], [-93.55, 41.61], [-93.5, 41.62]] },
};

test('wzdx: v4 work zone normalized with road, times, lanes and geometry', () => {
  const e = normalizeEvent(v4, feed, now);
  assert.equal(e.state, 'Iowa'); assert.equal(e.road, 'I-80'); assert.equal(e.direction, 'eastbound');
  assert.equal(e.type, 'construction'); assert.equal(e.lanes, 1); assert.equal(e.active, true);
  assert.equal(e.end, '2026-10-10T23:00:00Z'); assert.equal(e.coords.length, 3); assert.deepEqual(e.center, [-93.55, 41.61]);
});

test('wzdx: finished events dropped, full closures flagged', () => {
  assert.equal(normalizeEvent({ ...v4, properties: { ...v4.properties, end_date: '2026-09-30T00:00:00Z' } }, feed, now), null);
  const c = normalizeEvent({ ...v4, properties: { ...v4.properties, vehicle_impact: 'all-lanes-closed' } }, feed, now);
  assert.equal(c.type, 'closure');
});
