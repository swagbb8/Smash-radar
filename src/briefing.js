// SMASH the lion's script. Funny and goofy on fun stuff, serious on anything where people could be hurt.
// Facts come only from the stories; jokes are generic and never about victims. Always clean.
const TZ = 'America/Chicago';
const isLocal = (s) => s.location && ['confirmed', 'verified'].includes(s.location.status);
const pub = (s) => Date.parse(s.publishedAt || s.discoveredAt);
const SERIOUS_INC = new Set(['crash', 'fire', 'police', 'emergency', 'missing', 'weather', 'flooding', 'metra', 'outage', 'trees']);

export function speakable(text = '') {
  return String(text)
    .replace(/\s+-\s+[^-]{2,40}$/, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\bI-(\d+)/g, 'I $1')
    .replace(/\bIL-(\d+)/g, 'Route $1')
    .replace(/\bUS-(\d+)/g, 'U.S. $1')
    .replace(/&/g, ' and ')
    .replace(/\bvs\.?\b/gi, 'versus')
    .replace(/\bw\//gi, 'with ')
    .replace(/[“”"]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/:\s*/g, ': ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.!?]*$/, '')
    .trim();
}

function firstSentence(summary = '', title = '') {
  const s = String(summary).replace(/\s+/g, ' ').replace(/…$/, '').trim();
  if (!s || s.length < 30) return '';
  const ABBR = /\b(Sept|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|Aug|Mr|Mrs|Ms|Dr|St|Ave|Blvd|Rd|Inc|Co|Corp|Jr|Sr|vs|U\.S|No|Gov|Sen|Rep|Lt|Sgt|Capt)\.$/;
  let first = '';
  for (const m of s.matchAll(/[.!?](\s|$)/g)) {
    const cand = s.slice(0, m.index + 1);
    if (cand.length < 25 || ABBR.test(cand)) continue;
    first = cand; break;
  }
  if (!first) first = s.length <= 220 ? s : s.slice(0, 200).replace(/\s\S*$/, '');
  if (first.length > 240) return '';
  const a = new Set(title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const b = first.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (b.filter((w) => a.has(w)).length / Math.max(1, b.length) > 0.6) return '';
  return `${speakable(first)}.`;
}

// Deterministic "random" so the same story gets the same joke within one episode.
const pick = (arr, seed) => arr[Math.abs([...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % arr.length];

const INTRO = [
  "Hey hey hey! It's Smash, the SMASH NEWS lion, coming at you live from the jungle that is the Chicago suburbs.",
  "Rawr! Okay, that was my professional news roar. It's Smash, the SMASH NEWS lion, and I've been sniffing out what's new.",
  "What's up, everybody! Smash the lion here. I combed my mane, I had my coffee, and I am ready to report.",
  "Good news, bad news, weird news, snack news. It's Smash, the SMASH NEWS lion, and I've got all of it.",
];
const SERIOUS_IN = ['Okay, serious lion face for a second.', 'Quick serious one, so mane down for this.', 'Heads up, this one is important.'];
const LEADS = {
  breaking: ['Breaking right now.', 'This just came in.', 'Breaking news.'],
  dupage: ['Here at home in DuPage County,', 'Close to home,', 'Right here in DuPage,'],
  roads: ['Road and safety check.', 'Local safety alert.', 'Heads up for anyone out driving.'],
  recall: ['Recall alert. Check your stuff.', 'Safety recall time.'],
  product: ['New drop alert!', 'Ooh, something new just landed.', 'Fresh off the shelf.', 'Shiny new thing alert!'],
  deal: ['Deal alert! My wallet just purred.', 'Money saver coming in hot.', 'Bargain hunters, assemble!'],
  opening: ['Grand opening alert.', 'New spot just opened up.'],
  national: ['Across the country,', 'In national news,', 'Big picture, U.S. news.'],
  nfl: ['Football time! Let me put on my foam finger.', 'NFL update, and yes, lions love football.', 'Gridiron check-in.'],
  local: ['Around Chicagoland,', 'In the suburbs,', 'Around the area,'],
};
const QUIPS = {
  product: ['I would review it, but I only taste-test things with my nose.', 'Adding that to my lion wishlist.', "Honestly? I'd try it. I'd try anything once. Except baths.", 'Somebody tell my mane I need that.'],
  deal: ["Saving money is my favorite cardio.", 'My piggy bank is doing a happy dance.', "That's a bargain even a lion can respect."],
  energy: ['That much energy and I might actually chase my own tail.', 'One sip and I would be roaring at mailboxes.'],
  food: ['Excuse me while I drool on my news desk.', 'My stomach just roared louder than I do.', 'Is it lunch yet? Asking for a lion.'],
  gaming: ['My claws are ready for that controller.', 'Lions are naturally great at games. We just eat the controllers sometimes.'],
  auto: ['Vroom vroom, that one goes straight to my mane-tenance budget.', 'I would drive it, but my paws do not reach the pedals.'],
  tech: ['Finally, a gadget smarter than my cousin.', 'My phone is already jealous.'],
  clothing: ['Fresh kicks for my fresh paws.', 'Lions wear shoes now. It is a whole thing.'],
  opening: ['I will be there for the free samples. All of them.', 'New neighbor! I will bring a welcome roar.'],
  nfl: ["That's a game, folks!", 'Somebody give that player a snack. A big one.'],
};
const OUTRO = [
  "That's your SMASH NEWS update! I'll be back in about ten minutes with more. Stay smashing, stay safe, and keep your mane fluffy.",
  "And that's the news! Smash the lion, signing off for now. Fresh update in about ten minutes. Rawr!",
  "That's everything for this round. Drive safe, snack responsibly, and I'll see you in ten minutes.",
];

export function buildBriefing(stories, now = Date.now(), { nfl = null } = {}) {
  const fresh = stories.filter((s) => now - pub(s) < 36 * 3600e3 && !s.tags?.includes('RUMOR') && !s.tags?.includes('LEAK'));
  const pool = fresh.length >= 10 ? fresh : stories;
  const used = new Set();
  const brandsUsed = new Set();
  const take = (fn, n) => {
    const out = [];
    for (const s of pool.filter((x) => !used.has(x.id) && fn(x)).sort((a, b) => b.score - a.score)) {
      if (out.length >= n) break;
      if ((s.brands || []).some((b) => brandsUsed.has(b))) continue;
      out.push(s); used.add(s.id); (s.brands || []).forEach((b) => brandsUsed.add(b));
    }
    return out;
  };
  const roadInc = new Set(['crash', 'closure', 'construction', 'traffic', 'trees']);
  const groups = [
    ['breaking', take((s) => s.status === 'BREAKING', 2)],
    ['dupage', take((s) => isLocal(s), 4)],
    ['roads', take((s) => roadInc.has(s.location?.incident?.id) || (s.region?.roads && now - pub(s) < 12 * 3600e3), 2)],
    ['local', take((s) => s.region?.county && s.region.county !== 'DuPage', 2)],
    ['recall', take((s) => s.tags?.includes('RECALL'), 1)],
    ['product', take((s) => s.tags?.includes('LAUNCH') || s.tags?.includes('LIMITED'), 4)],
    ['deal', take((s) => s.tags?.includes('DEAL'), 3)],
    ['opening', take((s) => s.tags?.includes('OPENING'), 1)],
    ['national', take((s) => s.category === 'news', 3)],
  ];
  const segments = [];
  const time = new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  const day = new Date(now).toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ });
  const nflSegs = nflSegments(nfl, now);
  const count = groups.reduce((n, [, g]) => n + g.length, 0) + nflSegs.length;
  segments.push({ kind: 'intro', text: `${pick(INTRO, Math.floor(now / 6e5))} It's ${time} on ${day}, and I've got ${count} things for you. Let's get into it!` });
  let wasSerious = false;
  for (const [kind, list] of groups) {
    for (const s of list) {
      const inc = s.location?.incident?.id;
      const serious = kind === 'breaking' || kind === 'recall' || kind === 'roads' || SERIOUS_INC.has(inc) || /\b(killed|dead|dies|death|shooting|shot|stabb|crash|injur|missing|fire|arrest)/i.test(s.title);
      const where = isLocal(s) ? (s.location.places.filter((p) => p !== 'DuPage County')[0] || '') : (s.region?.county ? `${s.region.county} County` : '');
      let lead = pick(LEADS[kind], s.id);
      if ((kind === 'dupage' || kind === 'local') && where) lead = `${lead} in ${where}.`;
      if (serious && !wasSerious && kind !== 'breaking' && kind !== 'recall' && kind !== 'roads') lead = `${pick(SERIOUS_IN, s.id)} ${lead}`;
      const head = speakable(s.title);
      const extra = kind === 'recall' && s.recall?.action ? `${speakable(s.recall.action)}.` : firstSentence(s.summary, s.title);
      const quipList = serious ? null : (QUIPS[s.category] && kind !== 'deal' ? QUIPS[s.category] : QUIPS[kind]);
      const quip = quipList ? ` ${pick(quipList, s.id + kind)}` : '';
      segments.push({
        kind, storyId: s.id, title: s.title, imageUrl: s.imageUrl || null, category: s.category, source: s.sourceName,
        place: where || null, status: s.status, serious,
        text: `${lead} ${head}. ${extra}${quip}`.replace(/\s+/g, ' ').replace(/\.\./g, '.').trim(),
      });
      wasSerious = serious;
    }
    if (kind === 'opening') segments.push(...nflSegs); // NFL lands mid-show
  }
  segments.push({ kind: 'outro', text: pick(OUTRO, Math.floor(now / 6e5) + 1) });
  return { id: `b-${now}`, createdAt: new Date(now).toISOString(), segments, script: segments.map((x) => x.text).join(' ') };
}

function speakStat(v = '') {
  return String(v)
    .replace(/(\d+)\/(\d+)/g, '$1 of $2')
    .replace(/\bYDS\b/gi, 'yards').replace(/\bTDs?\b/g, 'touchdowns').replace(/\bCAR\b/gi, 'carries')
    .replace(/\bREC\b/gi, 'catches').replace(/\bINTs?\b/g, 'interceptions').replace(/\bTOT\b/gi, 'total tackles')
    .replace(/\b1 touchdowns\b/g, '1 touchdown').replace(/\b1 interceptions\b/g, '1 interception')
    .replace(/\s*,\s*/g, ', ');
}

function nflSegments(nfl, now) {
  if (!nfl?.games?.length) return [];
  const finals = nfl.games.filter((g) => g.state === 'post' && now - Date.parse(g.date) < 4 * 864e5).slice(-3);
  const live = nfl.games.filter((g) => g.state === 'in').slice(0, 2);
  const out = [];
  const say = (g, i) => {
    const [a, h] = [g.away, g.home];
    const lead = i === 0 ? `${pick(LEADS.nfl, g.id)} ` : '';
    const leader = g.leaders?.[0] ? ` ${g.leaders[0].player} led the way with ${speakStat(g.leaders[0].value)}.` : '';
    if (g.state === 'in') return `${lead}Live right now: the ${a.name} have ${a.score} and the ${h.name} have ${h.score}, ${g.detail}.${leader}`;
    const w = Number(a.score) > Number(h.score) ? a : h;
    const l = w === a ? h : a;
    return `${lead}Final score: the ${w.name} beat the ${l.name}, ${w.score} to ${l.score}.${leader} ${pick(QUIPS.nfl, g.id)}`;
  };
  [...live, ...finals].slice(0, 4).forEach((g, i) => out.push({ kind: 'nfl', gameId: g.id, title: `${g.away.abbr} ${g.away.score} – ${g.home.abbr} ${g.home.score}`, imageUrl: g.home.logo || null, category: 'nfl', text: say(g, i) }));
  return out;
}
