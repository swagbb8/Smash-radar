// DuPage County verification.
// Rule #1: a highway name alone NEVER makes a story a DuPage incident.
// A story is only placed on the DuPage radar when there is location evidence inside DuPage County.
import { DUPAGE_PLACES, DUPAGE_LANDMARKS, CHICAGO_OUTLETS } from './config.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ROADS = [
  ['I-88', /\b(I-?\s?88|Interstate 88|Reagan (Memorial )?Tollway)\b/i],
  ['I-355', /\b(I-?\s?355|Interstate 355|Veterans Memorial Tollway)\b/i],
  ['I-290', /\b(I-?\s?290|Interstate 290|Eisenhower Expressway|Ike)\b/],
  ['IL-390', /\b(IL-?\s?390|Route 390|Elgin[- ]O'?Hare)\b/i],
  ['IL-38', /\b(IL-?\s?38|Route 38|Roosevelt Road)\b/i],
  ['IL-53', /\b(IL-?\s?53|Route 53)\b/i],
  ['IL-59', /\b(IL-?\s?59|Route 59)\b/i],
  ['IL-56', /\b(IL-?\s?56|Route 56|Butterfield Road)\b/i],
  ['IL-64', /\b(IL-?\s?64|Route 64|North Avenue)\b/i],
  ['IL-83', /\b(IL-?\s?83|Route 83|Kingery Highway)\b/i],
  ['US-34', /\b(US-?\s?34|Route 34|Ogden Avenue)\b/i],
  ['US-20', /\b(US-?\s?20|Route 20|Lake Street)\b/i],
  ['I-294', /\b(I-?\s?294|Tri-State Tollway)\b/i],
];

export const INCIDENT_TYPES = [
  ['metra', 'Metra', /\b(Metra|BNSF line|UP-W|Union Pacific West|Milwaukee District|train (delay|crash|hit|struck))/i],
  ['missing', 'Missing Person', /\b(missing (child|teen|boy|girl|man|woman|person|senior)|endangered missing|amber alert|silver alert|last seen)\b/i],
  ['emergency', 'Emergency', /\b(evacuat\w*|hazmat|gas leak|explosion|shelter in place|lockdown)\b/i],
  ['fire', 'Fire', /\b(fire|blaze|flames|firefighters|arson|smoke)\b/i],
  ['crash', 'Crash', /\b(crash\w*|collision|wreck|rollover|hit-and-run|struck by|jackknif\w*|pedestrian (hit|killed|struck))\b/i],
  ['police', 'Police', /\b(police|shooting|shot|stabb\w*|arrest\w*|charged|robbery|burglary|homicide|carjack\w*|SWAT|suspect|sheriff)\b/i],
  ['flooding', 'Flooding', /\b(flood\w*|water rescue|high water)\b/i],
  ['weather', 'Weather', /\b(tornado|severe (weather|thunderstorm)|thunderstorm|winter storm|blizzard|ice storm|heat advisory|wind advisory|freeze warning|dense fog|weather (warning|watch|advisory)|hydrologic)\b/i],
  ['trees', 'Downed Trees', /\b(downed (tree|trees|power lines|wires)|trees? (down|fell|fallen|toppled)|fallen trees?|storm damage)\b/i],
  ['outage', 'Outage', /\b(outage|without power|power (is )?restored|ComEd|water main|boil order)\b/i],
  ['closure', 'Closure', /\b(road closed|closure|shut down|lanes? blocked|detour|closed (to traffic|lanes?|ramps?))\b/i],
  ['construction', 'Construction', /\b(construction|road ?work|resurfac\w*|lane reduction|IDOT|tollway project|bridge work)\b/i],
  ['traffic', 'Traffic', /\b(traffic|backup|backed up|congestion|gridlock)\b/i],
  ['school', 'Schools', /\b(school (closed|closure|closing|cancel\w*|lockdown|board|district)|e-learning day|classes cancel\w*|District \d{2,3})\b/i],
  ['safety', 'Public Safety', /\b(alert|warning|advisory|scam|recall)\b/i],
  ['business', 'New Business', /\b(grand opening|now open|opens?|opening|ribbon[- ]cutting|new (store|restaurant|location|business)|closing|to close|closes)\b/i],
  ['development', 'Development', /\b(development|redevelopment|zoning|plan commission|village board|city council|approved|proposal|apartments|construction of|groundbreaking|breaks ground)\b/i],
  ['event', 'Events', /\b(festival|fest\b|parade|fair|concert|market|tours?|celebration|fundraiser|5K|event)\b/i],
];

const IL_CONTEXT = /\b(Illinois|Ill\.|IL\b(?!-)|Chicago|Chicagoland|suburban Chicago|west suburb\w*|northwest suburb\w*|Cook County|Will County|Kane County)/i;
const DUPAGE_WORD = /\bDu\s?Page\b(?!\s+(River|Township|Medical Group))/i;

// Names that also commonly mean something else → need an explicit "Name, IL" style mention.
const STRICT = {
  Wayne: /(?<!(John|Lil|Bruce|Fort|Dwayne|Lil'|Kirk)\s)\bWayne\b(?=,?\s+(Ill\b|Ill\.|Illinois|IL\b))/,
  Addison: /\bAddison\b(?!\s+(Street|St\b|St\.|Avenue|Ave|Rae|Russell|Road|Rd))/,
};

const placeMatchers = DUPAGE_PLACES.map((p) => ({
  ...p,
  re: STRICT[p.name] || new RegExp(`\\b${esc(p.name).replace(/\\\.\s?/g, '\\.?\\s?')}\\b`, 'i'),
  withState: new RegExp(`\\b${esc(p.name)},?\\s+(Ill\\b|Ill\\.|Illinois|IL\\b)`, 'i'),
}));
const landmarkMatchers = DUPAGE_LANDMARKS.map(([name, town]) => ({ name, town, re: new RegExp(`\\b${esc(name)}\\b`, 'i') }));

function isChicagoOutlet(url = '', publisher = '') {
  const hay = `${url} ${publisher}`.toLowerCase();
  return CHICAGO_OUTLETS.some((o) => hay.includes(o.toLowerCase()));
}

export function detectRoads(text) {
  return ROADS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

export function detectIncident(text) {
  for (const [id, label, re] of INCIDENT_TYPES) if (re.test(text)) return { id, label };
  return null;
}

/**
 * @returns {{status:'confirmed'|'verified'|'nearby'|'rejected'|'none', places:string[], roads:string[], reason:string, incident:{id,label}|null}}
 */
export function verifyDupage({ title = '', summary = '', url = '', publisher = '', sourceId = '', nws = null }) {
  const text = `${title}. ${summary}`;
  const roads = detectRoads(text);
  const incident = detectIncident(title) || detectIncident(text);
  const base = { roads, incident };

  if (nws || sourceId === 'nws-dupage') {
    return { ...base, status: 'confirmed', places: ['DuPage County'], reason: 'Official National Weather Service alert issued for the DuPage County zone', incident: base.incident || { id: 'weather', label: 'Weather' } };
  }

  const ilContext = IL_CONTEXT.test(text) || isChicagoOutlet(url, publisher);
  const places = [];
  const border = [];
  for (const p of placeMatchers) {
    if (!p.re.test(text)) continue;
    const explicit = p.withState.test(text);
    const ok = p.unique || explicit || ilContext || DUPAGE_WORD.test(text);
    if (!ok) continue;
    (p.tier === 'core' ? places : border).push(p.name);
  }
  // "West Chicago" contains "Chicago": don't let it satisfy IL context on its own (handled: it's a place anyway).
  const landmarks = landmarkMatchers.filter((l) => l.re.test(text));

  // Patch articles are filed under a town path, e.g. patch.com/illinois/wheaton/...
  const patchTown = (url.match(/patch\.com\/illinois\/([a-z]+)\//i) || [])[1];
  const patchPlace = patchTown && DUPAGE_PLACES.find((p) => p.patch === patchTown.toLowerCase());

  if (DUPAGE_WORD.test(text)) {
    return { ...base, status: 'confirmed', places: uniq(['DuPage County', ...places, ...landmarks.map((l) => l.town)]), reason: 'Story explicitly references DuPage County' + (places.length ? ` (${places.join(', ')})` : '') };
  }
  if (places.length) {
    return { ...base, status: 'verified', places: uniq(places), reason: `Location in DuPage County: ${uniq(places).join(', ')}, IL` };
  }
  if (landmarks.length) {
    return { ...base, status: 'verified', places: uniq(landmarks.map((l) => l.town)), reason: `DuPage landmark: ${landmarks.map((l) => l.name).join(', ')}` };
  }
  if (patchPlace && patchPlace.tier === 'core') {
    return { ...base, status: 'verified', places: [patchPlace.name], reason: `Filed by Patch under ${patchPlace.name}, IL` };
  }
  if (border.length) {
    return { ...base, status: 'nearby', places: uniq(border), reason: `${uniq(border).join(', ')} only partly lies in DuPage County — location not confirmed` };
  }
  if (roads.length) {
    return { ...base, status: 'rejected', places: [], reason: `Only a highway reference (${roads.join(', ')}) — a road name alone doesn't place it in DuPage County` };
  }
  return { ...base, status: 'none', places: [], reason: 'No DuPage County location found' };
}

const uniq = (a) => [...new Set(a)];
