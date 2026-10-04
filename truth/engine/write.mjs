// Two-stage writing. Stage 1 pulls checkable claims out of real sources (each with an exact quote). Stage 2 turns the
// claims that survive verification into the carousel. The model never supplies facts from its own memory.
import { chat } from './llm.mjs';
import { checkClaim, unsupportedNumbers, soundsCausal } from './verify.mjs';
import { STYLES } from './styles.mjs';

const clip = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + ' …');

export function sourceBlock(sources, maxChars = 1100) {
  return sources.map((s) => `[${s.id}] ${s.title} (${[s.authors, s.year, s.venue].filter(Boolean).join(', ')}) — ${s.grade.design}${s.cited_by ? `, cited ${s.cited_by} times` : ''}\nTEXT: ${clip(s.text, maxChars)}`).join('\n\n');
}

const EXTRACT_SYSTEM = `You work the research desk at THE TRUTH, a publication that shows people how the modern world really works, using only evidence that can be checked.

You get a TOPIC and numbered SOURCES (abstracts of real studies and reference text). Pull out the findings a normal person would find surprising, unsettling or important.

Hard rules:
1. Use ONLY what the SOURCES say. No outside knowledge. Never use a number that is not in the sources.
2. Each claim is ONE plain sentence a 14-year-old could read. No jargon.
3. "quote" is the exact words from that source that prove the claim, copied character for character, 12 to 45 words long. If the claim uses a number, the quote must contain that number.
4. Cause and effect: say X "causes", "makes" or "leads to" Y only when the source is an experiment, a randomized trial, or a meta-analysis of them. Otherwise write "is linked to" or "goes along with".
5. Prefer the strongest sources (meta-analyses, systematic reviews, large studies). Ignore sources that are off-topic. Do not repeat the same finding twice.
6. "belief" is what most people assume about this topic. "angle" is one sentence: the most gripping true thing these sources show that contradicts or deepens that belief.`;

export async function extractClaims(topic, sources, { max = 6 } = {}) {
  const ids = sources.map((s) => s.id);
  const schema = { type: 'object', additionalProperties: false, required: ['belief', 'angle', 'claims'], properties: {
    belief: { type: 'string' }, angle: { type: 'string' },
    claims: { type: 'array', minItems: 3, maxItems: max, items: { type: 'object', additionalProperties: false, required: ['text', 'source', 'quote'], properties: { text: { type: 'string' }, source: { type: 'string', enum: ids }, quote: { type: 'string' } } } } } };
  const user = `TOPIC: ${topic}\n\nSOURCES:\n${sourceBlock(sources)}\n\nReturn JSON with "belief", "angle" and 3 to ${max} "claims".`;
  const r = await chat({ system: EXTRACT_SYSTEM, user, schema, schemaName: 'claims', maxTokens: 1100, temperature: 0.2, label: 'extract' });
  const byId = Object.fromEntries(sources.map((s) => [s.id, s])); const out = [];
  for (const c of r.json.claims || []) {
    const src = byId[c.source]; const check = checkClaim(c, src);
    out.push({ text: String(c.text).trim(), source: c.source, quote: String(c.quote).trim(), check, evidence: src ? src.grade.level : 'none' });
  }
  const good = out.filter((c) => c.check.ok).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  return { belief: r.json.belief, angle: r.json.angle, claims: good, rejected: out.filter((c) => !c.check.ok), llm: { ms: r.ms, model: r.model, timings: r.timings, usage: r.usage } };
}

const WRITE_SYSTEM = `You are the head writer at THE TRUTH, an Instagram publication that makes people stop scrolling and see ordinary life differently.
Voice: calm, precise, a little unsettling. A documentary narrator who knows something the viewer does not. Never hype. Never clickbait. Never lie.

You get VERIFIED CLAIMS, each already checked against a real study. Write one carousel from them.

Rules:
- Facts come ONLY from the claims. Do not add numbers, studies or facts. You MAY add questions, plain explanations of the claims, and one everyday scene that illustrates them without stating anything new as fact.
- Short. Body text is at most 38 words per slide. Headlines are at most 9 words. Simple words. Speak to "you".
- Keep cause-and-effect wording exactly as strong as the claim. "Linked to" stays "linked to".
- No emojis. No ALL CAPS. No "shocking", "you won't believe", "scientists hate". No exclamation marks.

The slides:
- fact: "big" is the single hardest-hitting number or 2 to 5 word phrase taken from a claim. "text" states that finding in one or two sentences.
- explain: what is actually going on: the mechanism, or what the researchers did and saw. Plainly.
- why: why this matters in the reader's own life.
- example: one specific everyday moment the reader will recognise, written in present tense. It illustrates the claims; it is not a new fact.
- question: one closing question that leaves the reader looking at their own life. Not a call to action.
- cover: "headline" is the hook. True to the claims, and it must make someone need the next slide. "sub" is one short line under it.
- hooks: 5 alternative cover headlines, one of each type, in this order: a question; a number; a contradiction ("You think X. The evidence says Y."); a direct statement to "you"; a quiet observation.
- caption: 2 to 4 short lines that add context, ending with "Sources on the last slide." No hashtags in it.
- hashtags: 10 to 14, lowercase, no spaces, no # sign.
- image: 3 ideas for dark, moody photographs with NO recognisable faces (objects, places, hands, silhouettes), 3 to 7 words each.`;

export async function writeCarousel({ topic, angle, belief, style, claims, sources, intensity = 2 }) {
  const cid = claims.map((c) => c.id); const st = STYLES[style] || STYLES.uncomfortable; const sById = Object.fromEntries(sources.map((s) => [s.id, s]));
  const slide = (withClaim) => ({ type: 'object', additionalProperties: false, required: withClaim ? ['headline', 'text', 'claim'] : ['headline', 'text'], properties: { headline: { type: 'string' }, text: { type: 'string' }, ...(withClaim ? { claim: { type: 'string', enum: cid } } : {}) } });
  const schema = { type: 'object', additionalProperties: false, required: ['fact', 'explain', 'why', 'example', 'question', 'cover', 'hooks', 'caption', 'hashtags', 'image'], properties: {
    fact: { type: 'object', additionalProperties: false, required: ['big', 'text', 'claim'], properties: { big: { type: 'string' }, text: { type: 'string' }, claim: { type: 'string', enum: cid } } },
    explain: slide(true), why: slide(true), example: slide(false),
    question: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
    cover: { type: 'object', additionalProperties: false, required: ['headline', 'sub'], properties: { headline: { type: 'string' }, sub: { type: 'string' } } },
    hooks: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } }, caption: { type: 'string' },
    hashtags: { type: 'array', minItems: 10, maxItems: 14, items: { type: 'string' } }, image: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } } } };
  const tone = ['measured and curious', 'direct and unsettling', 'stark, cold and confronting'][Math.max(0, Math.min(2, intensity - 1))];
  const user = `FORMAT: ${st.name} — ${st.brief}\nTONE: ${tone}\nTOPIC: ${topic}\nWHAT PEOPLE ASSUME: ${belief}\nTHE ANGLE: ${angle}\n\nVERIFIED CLAIMS:\n${claims.map((c) => `[${c.id}] ${c.text} (${sById[c.source]?.grade.design}, ${sById[c.source]?.year}; evidence: ${c.evidence})`).join('\n')}\n\nWrite the carousel as JSON.`;
  const r = await chat({ system: WRITE_SYSTEM, user, schema, schemaName: 'carousel', maxTokens: 1300, temperature: 0.75, label: 'write' });
  return { ...r.json, lint: lintCarousel(r.json, claims, sById), llm: { ms: r.ms, model: r.model, timings: r.timings, usage: r.usage } };
}

/** After-the-fact checks on the written slides: invented numbers, cause-and-effect creep, length, banned hype. */
export function lintCarousel(c, claims, sById = {}) {
  const issues = []; const facts = claims.map((x) => `${x.text} ${x.quote}`).join(' '); const byId = Object.fromEntries(claims.map((x) => [x.id, x]));
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
  const texts = { 'cover.headline': c.cover?.headline, 'cover.sub': c.cover?.sub, 'fact.big': c.fact?.big, 'fact.text': c.fact?.text, 'explain.text': c.explain?.text, 'why.text': c.why?.text, 'example.text': c.example?.text, 'question.text': c.question?.text, caption: c.caption };
  (c.hooks || []).forEach((h, i) => { texts[`hooks.${i}`] = h; });
  for (const [k, v] of Object.entries(texts)) {
    if (!v) { issues.push({ where: k, issue: 'empty' }); continue; }
    const bad = unsupportedNumbers(v, facts); if (bad.length) issues.push({ where: k, issue: `number not in verified claims: ${bad.join(', ')}`, severity: 'high' });
    if (/[\u{1F300}-\u{1FAFF}]/u.test(v)) issues.push({ where: k, issue: 'emoji' });
    if (/\b(shocking|you won'?t believe|mind-?blowing|scientists hate|insane)\b/i.test(v)) issues.push({ where: k, issue: 'hype wording' });
  }
  for (const k of ['fact', 'explain', 'why']) {
    const cl = byId[c[k]?.claim]; const src = cl ? sById[cl.source] : null;
    if (cl && soundsCausal(c[k].text) && !soundsCausal(cl.text) && !src?.grade?.causal) issues.push({ where: `${k}.text`, issue: 'cause-and-effect wording stronger than the claim', severity: 'high' });
    if (words(c[k]?.text) > 46) issues.push({ where: `${k}.text`, issue: `too long (${words(c[k].text)} words)` });
  }
  if (words(c.cover?.headline) > 11) issues.push({ where: 'cover.headline', issue: 'headline too long' });
  return issues;
}
