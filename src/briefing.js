// SMASH the lion's script. Funny and goofy on fun stuff, serious on anything where people could be hurt.
// Facts come only from the stories; jokes are generic and never about victims. Always clean.
const TZ = 'America/Chicago';
const isLocal = (s) => s.location && ['confirmed', 'verified'].includes(s.location.status);
const pub = (s) => Date.parse(s.publishedAt || s.discoveredAt);
const SERIOUS_INC = new Set(['crash', 'fire', 'police', 'emergency', 'missing', 'weather', 'flooding', 'metra', 'outage', 'trees']);

const ENT = { amp: '&', mdash: ' — ', ndash: ' – ', nbsp: ' ', quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '…', lt: '<', gt: '>' };
const decode = (t) => String(t).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(parseInt(e[1].toLowerCase() === 'x' ? e.slice(2) : e.slice(1), e[1].toLowerCase() === 'x' ? 16 : 10)) : ENT[e.toLowerCase()] ?? m));
export function speakable(text = '') {
  return decode(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/([a-z])\.([A-Z][a-z])/g, '$1. $2')
    .replace(/\s+-\s+[^-]{2,40}$/, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\bI-(\d+)/g, 'I $1')
    .replace(/\bIL-(\d+)/g, 'Route $1')
    .replace(/\bUS-(\d+)/g, 'U.S. $1')
    .replace(/&/g, ' and ')
    .replace(/\bvs\.?(?=\s|$)/gi, 'versus')
    .replace(/\bw\//gi, 'with ')
    .replace(/[“”"]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/:(?!\d\d)\s*/g, ': ')
    .replace(/^(live updates?|watch live|breaking|update|updated|developing)\s*:\s*/i, '')
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

/** Up to n speakable sentences from a summary (skips ones that just repeat the headline). */
function sentences(summary = '', title = '', n = 2) {
  const first = firstSentence(summary, title);
  const s = String(summary).replace(/\s+/g, ' ').replace(/(…|\.\.\.)$/, '').trim();
  const ABBR = /\b(Sept|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|Aug|Mr|Mrs|Ms|Dr|St|Ave|Blvd|Rd|Inc|Co|Corp|Jr|Sr|vs|U\.S|No|Gov|Sen|Rep|Lt|Sgt|Capt)\.$/;
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(/[.!?](\s|$)/g)) {
    const cand = s.slice(last, m.index + 1).trim();
    if (cand.length < 25 || ABBR.test(cand)) continue;
    parts.push(cand); last = m.index + 1;
  }
  const rest = parts.slice(first ? 1 : 0).filter((x) => x.length <= 260 && !/(click|subscribe|sign up|newsletter|read more|copyright|all rights)/i.test(x));
  const out = [first ? first.replace(/\.$/, '') : '', ...rest.slice(0, n - (first ? 1 : 0)).map(speakable)].filter(Boolean);
  return out.length ? `${out.join('. ').replace(/\.\./g, '.')}.` : '';
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
// Grown-up humor: adult-life jokes (rent, taxes, coffee, back pain, group chats). Clean, no swearing, never about victims.
const ADULT = {
  product: ["Oh, hell yeah. Take my money. Actually, don't, I need it for rent.", "Damn, that's nice. My wallet is already crying in the corner.", "Holy crap, I want it. I don't need it. But I want it.", "I'm not saying I'll buy it on day one. I'm saying my card is already out and my self-control just left the building.", "Somewhere, a guy is explaining this to his wife as a business expense.", "It's not impulse shopping if you think about it for eleven whole seconds.", "I have a strict budget. I just don't follow it. Like a gym membership.", "My bank account just looked at me and said, absolutely not, sir.", "I don't need it. But I didn't need my last three impulse buys either, and look how happy I am. Kind of.", "Rent is due, but you know what? So is joy.", "This is how they get you. You go in for paper towels, you leave with this and a scented candle named after a feeling.", "Treat yourself. Your therapist said so. Probably."],
  deal: ["Damn, that's a good deal. I hate that I'm this excited about it.", "Hell yeah, cheap stuff! This is what adulthood does to you.", "That price is so low it's honestly kind of suspicious. Damn.", "Nothing gets a grown man out of bed faster than a deal that ends at midnight.", "My cart has been sitting there for three weeks like an ex who won't text back. This might be the sign.", "Saving thirty percent on something I didn't need? Financially, I'm basically a genius.", "Remember: if you didn't buy it, you saved a hundred percent. I never remember that.", "Nothing makes me feel more like a grown up than getting excited about a sale on paper towels.", "That's not shopping, that's investing. That's what I tell my accountant, anyway. He doesn't laugh.", "Buy two, and you've basically made money. That's how math works now, right?", "Adulthood is just getting genuinely thrilled about a deal on a vacuum."],
  food: ["Oh, hell yes. Somebody stop me. Actually, don't.", "Damn, now I'm hungry, and it's all your fault.", "This is the kind of meal you eat, regret, and then order again on Thursday.", "Diet starts Monday. Which Monday? Don't worry about it.", "Fun fact: food eaten in the car doesn't count. Everybody knows that.", "My cholesterol just sent me a strongly worded email.", "Calories don't count if you eat it standing up over the sink at eleven at night. Science.", "My doctor says I need to eat more greens. Does a green wrapper count?", "This is a dinner for one and a nap for two.", "I'm not saying I'd drive forty minutes for it. I'm saying I already have my keys."],
  energy: ["Nothing says adulthood like needing a drink just to have the energy to answer emails.", "I'm not addicted. I just get emotional when the fridge is empty.", "My blood type is now just cold brew.", "Drink one at nine A.M. and you'll reply to every email from 2019 by lunch."],
  tech: ["Cool, another damn charger I'm gonna lose.", "Great, another password I'll forget and reset four times a year.", "It has more features than my last relationship had effort.", "Smart home, dumb owner. That's me.", "Can't wait to buy it, never read the manual, and call my nephew to set it up.", "Another device that knows more about me than my family does. Love that for us.", "It's great until it asks you to update at the exact moment you need it."],
  gaming: ["Hell yeah, I'm calling in sick. Don't tell my boss.", "The real final boss is my sleep schedule.", "I lost to a twelve year old online and he called me grandpa. I'm in my prime. Lion years.", "One more game, I said. At two in the morning. Like a responsible adult.", "My back hurts just thinking about a gaming marathon now. Getting older is wild."],
  auto: ["Damn, that's a pretty car. Too bad my bank account drives a bicycle.", "The monthly payment on that thing is more than my first apartment.", "Sure, it goes zero to sixty in three seconds. My paycheck goes from sixty to zero in two.", "I'd buy it, but my credit score just started laughing.", "Look at that car payment. Actually don't. Protect your peace."],
  opening: ["Another place to spend money while telling everyone you're saving up for a house.", "Opening day lines are where friendships go to die. I'll be there at five A.M.", "A new place to go and spend money I was saving for, um, nothing important. Retirement.", "Finally, somewhere new to see everyone from high school and pretend I didn't."],
  clothing: ["Nice shoes. Now I just need somewhere to go that isn't the grocery store.", "My closet is ninety percent hoodies and ten percent regret."],
  nfl: ["Holy crap, what a game. My blood pressure needs a timeout.", "Damn! Somebody call the fire department, because that was hot.", "Grown men hugging strangers in sports bars. Beautiful. Nothing else brings us together like that.", "Somebody's dad just threw a remote across a living room in pure joy.", "That's a Monday morning water cooler conversation right there.", "My fantasy team saw that and filed for emotional damages.", "Somebody check on everybody's group chat after that one. It's chaos in there.", "That's the kind of game that makes grown adults yell at a TV in a basement. I'm grown adults."],
  news: ["What the hell, America. Okay. Moving on.", "Every day the news reads like a group chat that got way out of hand.", "And people wonder why I'm on my third coffee.", "Just another normal day in America, where everything is happening all at once.", "Okay. Deep breath. Mane fluff. Moving on."],
};
const REACT = ["Oh, hell yeah!", "Holy crap, check this out!", "Damn, okay, listen to this.", "Oh, you're gonna love this one!", "Okay okay okay, I'm actually excited about this.", "Wait. Wait! Listen to this.", "Ooh, this one's fun!", "Alright, buckle up, buttercup.", "Oh, now we're talking!", "No way. Okay, check this out!", "You ready? Because I wasn't."];
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

export function speakStat(v = '') {
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
    const leader = g.leaders?.[0] ? ` Top stat line: ${g.leaders[0].player}, with ${speakStat(g.leaders[0].value)}.` : '';
    if (g.state === 'in') return `${lead}Live right now: the ${a.name} have ${a.score} and the ${h.name} have ${h.score}, ${g.detail}.${leader}`;
    const w = Number(a.score) > Number(h.score) ? a : h;
    const l = w === a ? h : a;
    return `${lead}Final score: the ${w.name} beat the ${l.name}, ${w.score} to ${l.score}.${leader} ${pick(QUIPS.nfl, g.id)}`;
  };
  [...live, ...finals].slice(0, 4).forEach((g, i) => out.push({ kind: 'nfl', gameId: g.id, title: `${g.away.abbr} ${g.away.score} – ${g.home.abbr} ${g.home.score}`, imageUrl: g.home.logo || null, category: 'nfl', text: say(g, i) }));
  return out;
}

// ======================= 30-MINUTE LIVE TV SHOW =======================
const WPS = 2.55; // spoken words per second for the neural voice at +8%
const words = (t) => String(t).split(/\s+/).filter(Boolean).length;
const SECTION = {
  top: { title: 'TOP STORIES', icon: '🚨', bumper: ["Let's start with the big stuff. Here are your top stories."] },
  dupage: { title: 'DUPAGE DESK', icon: '📍', bumper: ['Welcome to the DuPage Desk, where the news is so local you can probably hear it from your porch.', "Time for the DuPage Desk. Let's see what's happening in the neighborhood."] },
  roads: { title: 'ROADS & POLICE', icon: '🚓', bumper: ['Roads and Police time. Buckle up, this is the part that keeps you safe and out of traffic.', "It's Roads and Police. Crashes, closures, construction and police news across Chicagoland."] },
  local: { title: 'CHICAGOLAND', icon: '🏙️', bumper: ['Now a spin around Chicagoland, county by county.'] },
  nfl: { title: 'NFL ZONE', icon: '🏈', bumper: ['Welcome to the NFL Zone! Foam finger on. Let us talk football.', 'NFL Zone time. Scores, stars and stat lines.'] },
  drops: { title: 'NEW DROPS', icon: '📦', bumper: ['New Drops! The part of the show where my wallet gets nervous.', 'Time for New Drops: the newest stuff that just hit the shelves.'] },
  deals: { title: 'DEAL DEN', icon: '💰', bumper: ['Welcome to the Deal Den, where we save money and feel smart about it.', 'Deal Den time. Grab your coupons, I mean, your phone.'] },
  recalls: { title: 'RECALL CHECK', icon: '⚠️', bumper: ['Recall Check. Quick, important, and maybe check your garage after this.'] },
  openings: { title: 'GRAND OPENINGS', icon: '🏪', bumper: ['Grand Openings! New places to try, and yes, I will be first in line.'] },
  us: { title: 'AROUND THE U.S.', icon: '🇺🇸', bumper: ["Let's zoom out. Here's what's going on around the country."] },
  states: { title: 'STATE BY STATE', icon: '🗺️', bumper: ["State by State! Let's road trip across America, no gas money needed."] },
  tech: { title: 'TECH TALK', icon: '📱', bumper: ['Tech Talk. Gadgets, apps and things that beep.'] },
  games: { title: 'GAME ON', icon: '🎮', bumper: ['Game On! Controllers up.'] },
  food: { title: 'SNACK ATTACK', icon: '🍔', bumper: ['Snack Attack! Warning, this segment may cause hunger.'] },
  cars: { title: 'GARAGE', icon: '🚗', bumper: ['Welcome to the Garage, where everything goes vroom.'] },
  quick: { title: 'QUICK HITS', icon: '⚡', bumper: ['Lightning round! Quick Hits, rapid fire, here we go.'] },
};
const SHORT_INTRO = ["Rawr! Smash here with your SMASH NEWS rundown.", "Hey hey! It's Smash, and I've got the good stuff.", "Wake up, sleepyheads, it's Smash with the news!", "Smash the lion, live from my news desk, with way too much coffee in me."];
const SHORT_BUMP = {
  top: ['First up, the big one.', "Let's start with the big stuff."],
  dupage: ['Right here at home in DuPage.', 'Over in the neighborhood.'],
  roads: ['Heads up on the roads.', 'Road and police check.'],
  nfl: ['Football time!', 'NFL!'],
  drops: ['New stuff alert!', 'Something new just dropped!'],
  deals: ['Deal alert!', 'Wallets out!'],
  recalls: ['Quick recall check.'],
  us: ['And around the country.'],
};
const SHORT_OUTRO = [
  "That's the big stuff, damn it! Back in ten minutes. Stay smashing.",
  "Hell of a rundown, if I say so myself. New one in ten minutes.",
  "That's the big stuff! I'll be back in ten minutes with what's new. Stay smashing.",
  "And that's your rundown! New one in ten minutes. Go drink some water and pay a bill.",
  "That's it from me! Back in ten. Don't do anything I wouldn't do, which is not much.",
];
const UP_NEXT = ['Coming up next:', 'Stick around, because next up is', "Don't go anywhere. Up next:"];
const MID = [
  "If you're watching this at work, act natural. Just nod like it's a spreadsheet.",
  "Quick reminder: drink some water, pay that bill you've been ignoring, and text your mom back. Okay, back to the news.",
  "If you're watching this in the bathroom at work, respect. Your secret's safe with me.",
  "You're watching SMASH NEWS, live, with me, Smash the lion. No commercials, just news and a lot of mane.",
  "Quick mane fluff break. Okay, I'm back. Let's keep it rolling.",
  "If you're just tuning in, I'm Smash the lion and this is SMASH NEWS, everything new, every day.",
];

export function buildShow(stories, now = Date.now(), { nfl = null, targetMinutes = 30, avoid = [] } = {}) {
  const short = targetMinutes <= 5; // the 2-minute "big stuff" rundown
  const fresh = stories.filter((s) => now - pub(s) < (short ? 18 : 48) * 3600e3 && !s.tags?.includes('RUMOR') && !s.tags?.includes('LEAK'));
  const pool = fresh.length >= (short ? 15 : 40) ? fresh : stories;
  const avoidSet = new Set(avoid);
  // short show: newest big stories first, and skip what Smash said in the last rundown when there's something new
  const rank = (s) => (short ? s.score * (now - pub(s) < 3 * 3600e3 ? 1.6 : now - pub(s) < 8 * 3600e3 ? 1.2 : 1) * (avoidSet.has(s.id) ? 0.35 : 1) : s.score);
  const used = new Set();
  const brandsUsed = new Map();
  const take = (fn, n) => {
    const out = [];
    for (const s of pool.filter((x) => !used.has(x.id) && fn(x)).sort((a, b) => rank(b) - rank(a))) {
      if (out.length >= n) break;
      if ((s.brands || []).some((b) => (brandsUsed.get(b) || 0) >= 2)) continue;
      out.push(s); used.add(s.id); (s.brands || []).forEach((b) => brandsUsed.set(b, (brandsUsed.get(b) || 0) + 1));
    }
    return out;
  };
  const roadInc = new Set(['crash', 'closure', 'construction', 'traffic', 'trees', 'police', 'fire', 'emergency', 'flooding', 'weather', 'outage', 'metra', 'missing']);
  const ROADY = /\b(crash|collision|closure|closed|close|lanes?|traffic|construction|I-\d+|interstate|route \d+|road|highway|expressway|tollway|detour|bridge|ramp|police|cops?|sheriff|fire|firefighters|arrest\w*|charged|shooting|shot|stabb\w*|robbery|burglar\w*|theft|missing|pedestrian|driver|motorcycl\w*|metra|train|outage|evacuat\w*|swat)\b/i;
  const states = new Set();
  const plan = short ? [
    ['top', take((s) => (s.status === 'BREAKING' || (s.alsoReportedBy?.length || 0) >= 2) && ['news', 'dupage'].includes(s.category), 2)],
    ['dupage', take((s) => isLocal(s), 2)],
    ['roads', take((s) => ((s.region?.roads || s.region?.county || isLocal(s)) && ROADY.test(s.title)) || (isLocal(s) && roadInc.has(s.location?.incident?.id)), 1)],
    ['nfl', []],
    ['drops', take((s) => s.tags?.includes('LAUNCH') || s.tags?.includes('LIMITED'), 1)],
    ['deals', take((s) => s.tags?.includes('DEAL'), 1)],
    ['recalls', take((s) => s.tags?.includes('RECALL') && now - pub(s) < 12 * 3600e3, 1)],
    ['us', take((s) => s.category === 'news' && !s.region?.state, 1)],
  ] : [
    ['top', take((s) => (s.status === 'BREAKING' || (s.alsoReportedBy?.length || 0) >= 3) && ['news', 'dupage'].includes(s.category), 6)],
    ['dupage', take((s) => isLocal(s), 12)],
    ['roads', take((s) => ((s.region?.roads || s.region?.county || isLocal(s)) && ROADY.test(s.title)) || (isLocal(s) && roadInc.has(s.location?.incident?.id)), 10)],
    ['local', take((s) => s.region?.county && s.region.county !== 'DuPage', 8)],
    ['nfl', []],
    ['drops', take((s) => s.tags?.includes('LAUNCH') || s.tags?.includes('LIMITED'), 14)],
    ['deals', take((s) => s.tags?.includes('DEAL'), 12)],
    ['recalls', take((s) => s.tags?.includes('RECALL'), 4)],
    ['openings', take((s) => s.tags?.includes('OPENING') || s.tags?.includes('CLOSING'), 4)],
    ['us', take((s) => s.category === 'news' && !s.region?.state, 14)],
    ['states', take((s) => { const st = s.region?.state; if (!st || st === 'Illinois' || states.has(st)) return false; states.add(st); return true; }, 12)],
    ['tech', take((s) => s.category === 'tech', 6)],
    ['games', take((s) => s.category === 'gaming', 5)],
    ['food', take((s) => s.category === 'food' || s.category === 'energy', 6)],
    ['cars', take((s) => s.category === 'auto', 5)],
    ['quick', take(() => true, 40)],
  ];
  const segs = [];
  const time = new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  const day = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });
  segs.push({ kind: 'intro', section: 'SMASH NEWS', mood: 'hype', text: short
    ? `${pick(SHORT_INTRO, Math.floor(now / 6e5))} It's ${time}. Here's the big stuff, in two minutes. Go!`
    : `${pick(INTRO, Math.floor(now / 18e5))} It's ${time} on ${day}, and this is your thirty minute SMASH NEWS show. We've got local news, roads, football, new stuff, deals, and news from all over the country. Let's go!` });
  const nflSegs = nflSegments(nfl, now).slice(0, short ? 1 : 4).map((x) => ({ ...x, section: 'NFL ZONE' }));
  const nflNews = (nfl?.news || []).slice(0, short ? 0 : 4).map((n, k) => ({ kind: 'nfl', section: 'NFL ZONE', title: n.title, imageUrl: n.image, category: 'nfl', source: 'ESPN', text: `${k === 0 ? 'In other football news, ' : ''}${speakable(n.title)}. ${firstSentence(n.summary, n.title)}`.trim() }));
  let wordCount = words(segs[0].text);
  const budget = targetMinutes * 60 * WPS * (short ? 0.85 : 1);
  const active = plan.filter(([key, list]) => (key === 'nfl' ? nflSegs.length + nflNews.length : list.length));
  active.forEach(([key, list], idx) => {
    if (wordCount > budget) return;
    const sec = SECTION[key];
    segs.push({ kind: 'bumper', section: sec.title, icon: sec.icon, mood: ['roads', 'recalls'].includes(key) ? 'normal' : 'hype', text: short ? pick(SHORT_BUMP[key] || [`${sec.title}.`], now + idx) : pick(sec.bumper, now + idx) });
    const items = key === 'nfl' ? [...nflSegs, ...nflNews] : list;
    for (const it of items) {
      if (wordCount > budget) break;
      let seg;
      if (key === 'nfl') seg = short ? { ...it, text: it.text.replace(/^.*?(Final score|Live right now)/, '$1') } : it;
      else if (key === 'quick') seg = { kind: 'quick', storyId: it.id, title: it.title, imageUrl: it.imageUrl || null, category: it.category, source: it.sourceName, text: `${speakable(it.title)}.` };
      else {
        const inc = it.location?.incident?.id || it.region?.incident?.id;
        const serious = ['top', 'roads', 'recalls'].includes(key) || SERIOUS_INC.has(inc) || /\b(killed|dead|dies|death|shooting|shot|stabb|crash|injur|missing|fire|arrest)/i.test(it.title);
        const where = isLocal(it) ? (it.location.places.filter((p) => p !== 'DuPage County')[0] || 'DuPage County') : it.region?.county ? `${it.region.county} County` : it.region?.state || '';
        const lead = key === 'states' ? `In ${it.region.state},` : (key === 'dupage' || key === 'roads' || key === 'local') && where ? `In ${where},` : '';
        const cap = (t, n) => { const w = t.split(/\s+/); return w.length <= n ? t : `${w.slice(0, n).join(' ').replace(/[,;:]$/, '')}.`; };
        const deep = ['top', 'dupage', 'us', 'local', 'roads', 'recalls', 'states'].includes(key);
        const extra = key === 'recalls' && it.recall?.action ? `${short ? '' : sentences(it.summary, it.title, 1)} ${speakable(it.recall.action)}.` : short ? cap(sentences(it.summary, it.title, 1), 18) : cap(sentences(it.summary, it.title, deep ? 3 : 2), deep ? 70 : 45);
        const quipList = serious ? null : (QUIPS[it.category] && key !== 'deals' ? QUIPS[it.category] : QUIPS[key === 'drops' ? 'product' : key === 'deals' ? 'deal' : key === 'openings' ? 'opening' : ''] );
        const h = Math.abs([...it.id].reduce((a, c) => a + c.charCodeAt(0), 0));
        const adultList = ADULT[key === 'drops' ? 'product' : key === 'deals' ? 'deal' : key === 'openings' ? 'opening' : it.category] || null;
        const quip = serious ? '' : adultList && h % 4 !== 3 ? ` ${pick(adultList, it.id)}` : quipList && h % 4 === 3 ? ` ${pick(quipList, it.id)}` : '';
        const react = !serious && ['drops', 'deals', 'food', 'games', 'cars', 'tech', 'openings'].includes(key) && h % 4 === 0 ? `${pick(REACT, it.id)} ` : '';
        seg = { kind: key, storyId: it.id, title: it.title, imageUrl: it.imageUrl || null, category: it.category, source: it.sourceName, place: where || null, serious, mood: serious ? 'serious' : ['drops', 'deals', 'food', 'games', 'cars', 'openings'].includes(key) ? 'hype' : 'normal', text: `${react}${lead} ${speakable(it.title)}. ${extra}${quip}`.replace(/\s+/g, ' ').replace(/\.\./g, '.').trim() };
      }
      seg.section = sec.title;
      if (!seg.mood) seg.mood = key === 'nfl' ? 'hype' : 'normal';
      segs.push(seg);
      wordCount += words(seg.text);
    }
    if (!short && (idx === 3 || idx === 8)) segs.push({ kind: 'bumper', section: sec.title, text: pick(MID, now + idx) });
    const next = active[idx + 1];
    if (!short && next && wordCount < budget) segs.push({ kind: 'bumper', section: sec.title, text: `${pick(UP_NEXT, now + idx)} ${SECTION[next[0]].title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace('Dupage', 'DuPage').replace('Nfl', 'NFL').replace('U.s.', 'U.S.').replace(' & ', ' and ')}.`.replace('..', '.') });
  });
  if (short) segs.push({ kind: 'outro', section: 'SMASH NEWS', mood: 'hype', text: pick(SHORT_OUTRO, Math.floor(now / 6e5)) });
  else segs.push({ kind: 'outro', section: 'SMASH NEWS', text: `${pick(OUTRO, Math.floor(now / 18e5) + 1).replace('in about ten minutes', 'with a brand new show in thirty minutes').replace('in ten minutes', 'in thirty minutes')}` });
  // timing estimate (replaced by real audio durations after the voice is generated)
  let t = 0;
  for (const x of segs) { x.dur = Math.max(2.5, words(x.text) / WPS + 0.4); x.start = t; t += x.dur; }
  return { id: `show-${now}`, createdAt: new Date(now).toISOString(), startsAt: new Date(now).toISOString(), totalSeconds: Math.round(t), wordCount, segments: segs };
}

/** Show slot (Central time, every 10 minutes by default) a timestamp belongs to, e.g. 2026-10-01T20:30. */
export function showSlot(ms = Date.now(), minutes = 10) {
  const d = new Date(ms);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${String(Math.floor(Number(p.minute) / minutes) * minutes).padStart(2, '0')}`;
}
