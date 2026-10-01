import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyFromSummary, playFantasy } from '../src/fantasy.js';

const ath = (name, pos, stats) => ({ athlete: { displayName: name, position: { abbreviation: pos } }, stats });
const summary = {
  header: { competitions: [{ competitors: [{ homeAway: 'away', score: '7', team: { abbreviation: 'PHI' } }, { homeAway: 'home', score: '27', team: { abbreviation: 'CHI' } }] }] },
  boxscore: {
    teams: [
      { team: { abbreviation: 'PHI' }, statistics: [{ name: 'interceptions', displayValue: '1' }, { name: 'fumblesLost', displayValue: '1' }, { name: 'sacksYardsLost', displayValue: '3-21' }] },
      { team: { abbreviation: 'CHI' }, statistics: [{ name: 'interceptions', displayValue: '0' }, { name: 'fumblesLost', displayValue: '0' }, { name: 'sacksYardsLost', displayValue: '1-6' }] },
    ],
    players: [
      { team: { abbreviation: 'CHI' }, statistics: [
        { name: 'passing', keys: ['completions/passingAttempts', 'passingYards', 'yardsPerPassAttempt', 'passingTouchdowns', 'interceptions'], athletes: [ath('Case Keenum', 'QB', ['24/34', '247', '7.3', '2', '0'])] },
        { name: 'rushing', keys: ['rushingAttempts', 'rushingYards', 'yardsPerRushAttempt', 'rushingTouchdowns'], athletes: [ath("D'Andre Swift", 'RB', ['20', '84', '4.2', '1'])] },
        { name: 'receiving', keys: ['receptions', 'receivingYards', 'yardsPerReception', 'receivingTouchdowns', 'longReception', 'receivingTargets'], athletes: [ath('DJ Moore', 'WR', ['6', '90', '15', '1', '34', '8'])] },
        { name: 'kicking', keys: ['fieldGoalsMade/fieldGoalAttempts', 'fieldGoalPct', 'longFieldGoalMade', 'extraPointsMade/extraPointAttempts'], athletes: [ath('Cairo Santos', 'K', ['2/2', '100', '41', '3/3'])] },
      ] },
      { team: { abbreviation: 'PHI' }, statistics: [
        { name: 'passing', keys: ['completions/passingAttempts', 'passingYards', 'yardsPerPassAttempt', 'passingTouchdowns', 'interceptions'], athletes: [ath('Jalen Hurts', 'QB', ['20/31', '210', '6.8', '0', '1'])] },
        { name: 'fumbles', keys: ['fumbles', 'fumblesLost'], athletes: [ath('Jalen Hurts', 'QB', ['1', '1'])] },
      ] },
    ],
  },
};
const plays = [{ team: 'CHI', text: 'Cairo Santos 41 Yd Field Goal' }, { team: 'CHI', text: 'Cairo Santos 38 Yd Field Goal' }];

test('fantasy: ESPN PPR points from a real-shaped box score', () => {
  const f = fantasyFromSummary(summary, plays);
  const p = (side, name) => f[side].players.find((x) => x.player === name);
  assert.equal(p('home', 'Case Keenum').pts, 17.9);       // 247*.04 + 2*4
  assert.equal(p('home', "D'Andre Swift").pts, 14.4);     // 8.4 + 6
  assert.equal(p('home', 'DJ Moore').pts, 21);            // 6 + 9 + 6
  assert.equal(p('home', 'Cairo Santos').pts, 10);        // 4 + 3 + 3 XP
  assert.equal(p('away', 'Jalen Hurts').pts, 4.4);        // 8.4 - 2 - 2
  assert.equal(p('home', 'CHI D/ST').pts, 10);            // 3 sacks + INT 2 + FR 2 + 7 allowed (3)
});

test('fantasy: points for a single scoring play', () => {
  assert.deepEqual(playFantasy('DJ Moore 34 Yd pass from Case Keenum (Cairo Santos Kick)'), [{ player: 'DJ Moore', pts: 10.4 }, { player: 'Case Keenum', pts: 5.4 }]);
  assert.deepEqual(playFantasy("D'Andre Swift 12 Yd Run (Cairo Santos Kick)"), [{ player: "D'Andre Swift", pts: 7.2 }]);
  assert.deepEqual(playFantasy('Cairo Santos 52 Yd Field Goal'), [{ player: 'Cairo Santos', pts: 5 }]);
});
