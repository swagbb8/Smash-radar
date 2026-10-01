// Fantasy points using ESPN's standard PPR scoring, computed from the real box score.
// Offense: pass yd 0.04, pass TD 4, INT -2, 2-pt 2 | rush/rec yd 0.1, rush/rec TD 6, reception 1, fumble lost -2
// Kicker: PAT 1, FG 0-39 = 3, 40-49 = 4, 50+ = 5, missed FG -1 | D/ST: sack 1, INT 2, fumble rec 2, TD 6, safety 2, points-allowed tiers
export const ESPN_PPR = { passYd: 0.04, passTd: 4, int: -2, rushYd: 0.1, rushTd: 6, rec: 1, recYd: 0.1, recTd: 6, fumLost: -2, twoPt: 2, pat: 1, fgMiss: -1 };
const S = ESPN_PPR;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const r1 = (x) => Math.round(x * 10) / 10;

function paTier(pa) {
  if (pa === 0) return 5; if (pa <= 6) return 4; if (pa <= 13) return 3; if (pa <= 17) return 1; if (pa <= 27) return 0; if (pa <= 34) return -1; if (pa <= 45) return -3; return -5;
}
const fgPts = (yds) => (yds >= 50 ? 5 : yds >= 40 ? 4 : 3);

/** ESPN summary JSON -> per-team fantasy rosters with points and stat lines. */
export function fantasyFromSummary(d, scoringPlays = []) {
  const players = new Map(); // key team|name
  const get = (team, a) => {
    const name = a.displayName || a.fullName || '';
    const k = `${team}|${name}`;
    if (!players.has(k)) players.set(k, { team, player: name, short: a.shortName || name, pos: a.position?.abbreviation || '', headshot: a.headshot?.href || null, st: {} });
    return players.get(k);
  };
  for (const tp of d.boxscore?.players || []) {
    const team = tp.team?.abbreviation;
    for (const cat of tp.statistics || []) {
      const keys = cat.keys || [];
      for (const ath of cat.athletes || []) {
        const p = get(team, ath.athlete || {});
        const val = (k) => { const i = keys.indexOf(k); return i >= 0 ? ath.stats?.[i] : undefined; };
        switch (cat.name) {
          case 'passing': p.st.passYd = num(val('passingYards')); p.st.passTd = num(val('passingTouchdowns')); p.st.int = num(val('interceptions')); p.st.cmpAtt = val('completions/passingAttempts') || ''; if (!p.pos) p.pos = 'QB'; break;
          case 'rushing': p.st.rushYd = num(val('rushingYards')); p.st.rushTd = num(val('rushingTouchdowns')); p.st.car = num(val('rushingAttempts')); break;
          case 'receiving': p.st.rec = num(val('receptions')); p.st.recYd = num(val('receivingYards')); p.st.recTd = num(val('receivingTouchdowns')); p.st.tgt = num(val('receivingTargets')); break;
          case 'fumbles': p.st.fumLost = num(val('fumblesLost')); break;
          case 'kicking': { const [m, a] = String(val('fieldGoalsMade/fieldGoalAttempts') || '0/0').split('/').map(num); const [xm] = String(val('extraPointsMade/extraPointAttempts') || '0/0').split('/').map(num); p.st.fgm = m; p.st.fga = a; p.st.xpm = xm; p.pos = 'K'; break; }
          default: break;
        }
      }
    }
  }
  // kicker FG distances + 2-pt conversions from scoring plays
  for (const sp of scoringPlays) {
    const fg = String(sp.text).match(/^(.+?) (\d+) Yd Field Goal/i);
    if (fg) for (const p of players.values()) if (p.team === sp.team && p.player === fg[1]) (p.st.fgYds ||= []).push(num(fg[2]));
    const two = String(sp.text).match(/\((.+?) (?:Pass|Run) (?:to (.+?) )?for Two-Point Conversion\)/i) || String(sp.text).match(/Two-Point .*?(?:by|to) (.+?)\b/i);
    if (two) for (const nm of [two[1], two[2]].filter(Boolean)) for (const p of players.values()) if (p.team === sp.team && p.player === nm.trim()) p.st.twoPt = (p.st.twoPt || 0) + 1;
  }
  const out = { scoring: 'ESPN standard PPR' };
  const comp = d.header?.competitions?.[0];
  const teams = (comp?.competitors || []).map((c) => ({ abbr: c.team?.abbreviation, side: c.homeAway, score: num(c.score) }));
  for (const t of teams) {
    const list = [];
    for (const p of players.values()) {
      if (p.team !== t.abbr) continue;
      const s = p.st;
      let pts = (s.passYd || 0) * S.passYd + (s.passTd || 0) * S.passTd + (s.int || 0) * S.int
        + (s.rushYd || 0) * S.rushYd + (s.rushTd || 0) * S.rushTd + (s.rec || 0) * S.rec + (s.recYd || 0) * S.recYd + (s.recTd || 0) * S.recTd
        + (s.fumLost || 0) * S.fumLost + (s.twoPt || 0) * S.twoPt;
      if (p.pos === 'K') { const dists = s.fgYds || []; pts = (s.xpm || 0) * S.pat + dists.reduce((a, y) => a + fgPts(y), 0) + Math.max(0, (s.fgm || 0) - dists.length) * 3 + ((s.fga || 0) - (s.fgm || 0)) * S.fgMiss; }
      const line = [s.cmpAtt && `${s.cmpAtt}, ${s.passYd} PASS YDS`, s.passTd && `${s.passTd} PASS TD`, s.int && `${s.int} INT`, s.car && `${s.car}-${s.rushYd} RUSH`, s.rushTd && `${s.rushTd} RUSH TD`, s.rec && `${s.rec}-${s.recYd} REC`, s.recTd && `${s.recTd} REC TD`, s.fumLost && `${s.fumLost} FUM`, p.pos === 'K' && `${s.fgm || 0}/${s.fga || 0} FG, ${s.xpm || 0} XP`].filter(Boolean).join(' · ');
      if (!line) continue;
      list.push({ player: p.player, short: p.short, pos: p.pos, pts: r1(pts), line, headshot: p.headshot });
    }
    // D/ST from the opponent's side of the box score
    const opp = teams.find((x) => x !== t);
    const defStats = (d.boxscore?.teams || []).find((x) => x.team?.abbreviation === t.abbr)?.statistics || [];
    const dst = (name) => num(defStats.find((x) => x.name === name)?.displayValue);
    const oppStats = (d.boxscore?.teams || []).find((x) => x.team?.abbreviation === opp?.abbr)?.statistics || [];
    const oppVal = (name) => oppStats.find((x) => x.name === name)?.displayValue;
    const sacks = num(String(oppVal('sacksYardsLost') || '').split('-')[0]);
    const takeInt = num(oppVal('interceptions')); const takeFum = num(oppVal('fumblesLost'));
    const defTd = dst('defensiveTouchdowns') || 0;
    const dPts = sacks * 1 + takeInt * 2 + takeFum * 2 + defTd * 6 + (opp ? paTier(opp.score) : 0);
    list.push({ player: `${t.abbr} D/ST`, short: `${t.abbr} D/ST`, pos: 'D/ST', pts: r1(dPts), line: `${sacks} SACK · ${takeInt} INT · ${takeFum} FR · ${opp?.score ?? 0} PTS ALLOWED` });
    list.sort((a, b) => b.pts - a.pts);
    out[t.side] = { abbr: t.abbr, players: list, total: r1(list.reduce((a, p) => a + p.pts, 0)) };
  }
  return out;
}

/** Fantasy points a single scoring play was worth, e.g. "DJ Moore 34 Yd pass from Case Keenum" → Moore +10.4, Keenum +5.4. */
export function playFantasy(text = '') {
  const t = String(text);
  let m;
  const out = [];
  if ((m = t.match(/^(.+?) (\d+) Yd pass from (.+?)(?: \(|$)/i))) { const y = num(m[2]); out.push({ player: m[1], pts: r1(S.recTd + y * S.recYd + S.rec) }, { player: m[3], pts: r1(S.passTd + y * S.passYd) }); }
  else if ((m = t.match(/^(.+?) (\d+) Yd (?:Run|Rush)/i))) out.push({ player: m[1], pts: r1(S.rushTd + num(m[2]) * S.rushYd) });
  else if ((m = t.match(/^(.+?) (\d+) Yd Field Goal/i))) out.push({ player: m[1], pts: fgPts(num(m[2])) });
  else if (/(Interception|Fumble|Punt|Kickoff|Blocked).*Return/i.test(t) && (m = t.match(/^(.+?) \d+ Yd/i))) out.push({ player: 'D/ST', pts: 6, who: m[1] });
  return out;
}
