// Every prompt the engine sends to its AI writer, with the JSON shape it must return.
// Design rule: the model never supplies facts. It may only select and rephrase what is inside the retrieved sources,
// and each factual sentence must carry the exact quote that proves it (checked in ground.mjs, not by the model).
import { truncate } from './lib/text.mjs';

export const STYLES = {
  uncomfortable: { name: 'THE UNCOMFORTABLE TRUTH', about: 'things people would rather not think about' },
  hijacked: { name: 'YOUR BRAIN IS BEING HIJACKED', about: 'psychology, behavioural science, technology and attention' },
  unseen: { name: "THE WORLD YOU DON'T SEE", about: 'hidden systems, invisible influences, everyday processes people overlook' },
  darkside: { name: 'THE DARK SIDE OF MODERN LIFE', about: 'unintended consequences of technology, consumer culture and modern lifestyles' },
  reality: { name: 'REALITY CHECK', about: 'misconceptions, surprising facts, what the evidence actually says' },
  future: { name: 'THE FUTURE IS CLOSER THAN YOU THINK', about: 'AI, technology, scientific breakthroughs and their possible consequences' },
  think: { name: 'THINK ABOUT THIS', about: 'deep philosophical and psychological questions about being human' },
};

const TYPE_LABEL = { 'meta-analysis': 'META-ANALYSIS (many studies combined)', 'systematic-review': 'SYSTEMATIC REVIEW', rct: 'RANDOMIZED CONTROLLED TRIAL', trial: 'CLINICAL TRIAL', experiment: 'EXPERIMENT', review: 'REVIEW ARTICLE', observational: 'OBSERVATIONAL STUDY (shows association, not cause)', preprint: 'PREPRINT (not yet peer reviewed)', study: 'STUDY', data: 'OFFICIAL DATA', encyclopedia: 'BACKGROUND (encyclopedia)', news: 'NEWS REPORT' };

export function sourceBlock(sources, { maxChars = 1100 } = {}) {
  return sources.map((s, i) => `[S${i + 1}] ${TYPE_LABEL[s.type] || 'STUDY'} · ${s.year || 'n.d.'} · ${s.venue || s.provider}${s.citedBy ? ` · cited by ${s.citedBy} papers` : ''}\nTitle: ${s.title}\nText: ${truncate(s.abstract || s.text || '', maxChars)}`).join('\n\n');
}

// ------------------------------------------------------------------ 1. evidence extraction
export const CLAIMS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['claims', 'verdict', 'caveat'],
  properties: {
    claims: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['claim', 'source', 'quote', 'strength', 'surprise'],
      properties: { claim: { type: 'string' }, source: { type: 'string' }, quote: { type: 'string' }, strength: { type: 'string', enum: ['strong', 'moderate', 'early'] }, surprise: { type: 'integer', minimum: 1, maximum: 5 } } } },
    verdict: { type: 'string' }, caveat: { type: 'string' },
  },
};

export function claimsPrompt({ topic, angle, sources }) {
  const system = 'You are the research desk of THE TRUTH, a publication that shows people how the modern world really works. You are strict: you only report what the supplied sources say. You never add facts, numbers, names or dates from memory.';
  const user = `TOPIC: ${topic}
ANGLE: ${angle}

SOURCES — the only facts you may use:

${sourceBlock(sources)}

TASK
Pick the 5 to 7 most surprising, concrete findings in these sources that fit the angle. For each finding give:
- "claim": ONE plain-English sentence a 14-year-old would understand. Copy every number exactly as the source gives it. Write "is linked to" for observational studies; use "causes", "makes" or "reduces" only when the source is an experiment, a randomized trial, or a meta-analysis of experiments.
- "source": the tag of the source it comes from, like "S2".
- "quote": the exact words from that source's text that prove the claim — 8 to 40 words, copied character for character, no paraphrasing.
- "strength": "strong" (meta-analysis, systematic review or large randomized trial), "moderate" (one solid study), "early" (small, preliminary, animal, lab-only or preprint).
- "surprise": 1 to 5 — how much it contradicts what most people assume.

Rules: skip findings that are vague, obvious, or only about methods. Do not repeat the same finding twice. If the sources do not support the angle, return an empty "claims" list.
Also return "verdict" (one sentence: what the evidence says overall, honestly) and "caveat" (one sentence: the most important limitation).

Return JSON only.`;
  return { system, user, schema: CLAIMS_SCHEMA, schemaName: 'evidence' };
}

// ------------------------------------------------------------------ 2. carousel writing
const slide = (extra = {}) => ({ type: 'object', additionalProperties: false, required: ['headline', 'body', 'facts'], properties: { headline: { type: 'string' }, body: { type: 'string' }, facts: { type: 'array', maxItems: 3, items: { type: 'string' } }, ...extra } });
export const CAROUSEL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'hooks', 'reveal', 'explain', 'matters', 'example', 'question', 'stat', 'caption', 'hashtags', 'images'],
  properties: {
    title: { type: 'string' },
    hooks: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['text', 'type'], properties: { text: { type: 'string' }, type: { type: 'string', enum: ['question', 'number', 'contradiction', 'accusation', 'scene'] } } } },
    reveal: slide(), explain: slide(), matters: slide(), example: slide(),
    question: { type: 'object', additionalProperties: false, required: ['headline', 'body'], properties: { headline: { type: 'string' }, body: { type: 'string' } } },
    stat: { type: 'object', additionalProperties: false, required: ['value', 'label', 'fact'], properties: { value: { type: 'string' }, label: { type: 'string' }, fact: { type: 'string' } } },
    caption: { type: 'string' }, hashtags: { type: 'array', maxItems: 12, items: { type: 'string' } }, images: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } },
  },
};

export const VOICE = `VOICE
- A documentary narrator: calm, exact, a little cold. The unease comes from the facts, never from adjectives.
- Talk to one person: "you", present tense. Short sentences. Plain words. Concrete nouns you can picture.
- Banned: exclamation marks, emojis, hashtags inside slides, rhetorical "Did you know", and the words shocking, mind-blowing, insane, crazy, secret they don't want you to know, wake up, sheeple.
- Never promise more than the evidence shows. If a fact is "linked to", it stays "linked to".

LENGTH
- Hook / headline: 4 to 12 words. Body: 15 to 40 words. One idea per slide.`;

export function carouselPrompt({ topic, angle, style, facts, verdict, caveat, intensity = 2, avoid = [] }) {
  const st = STYLES[style] || STYLES.uncomfortable;
  const system = `You are the head writer of THE TRUTH, an Instagram publication that exposes the hidden forces shaping people's minds, behaviour and society. Series: "${st.name}" — ${st.about}. Every factual statement you write must come from the VERIFIED FACTS you are given.`;
  const tone = ['measured and curious', 'direct and unsettling', 'stark and confrontational (still accurate)'][Math.max(0, Math.min(2, intensity - 1))];
  const user = `TOPIC: ${topic}
ANGLE: ${angle}

VERIFIED FACTS — use only these for anything factual:
${facts.map((f, i) => `[F${i + 1}] ${f.claim} (${f.label})`).join('\n')}

WHAT THE EVIDENCE SAYS OVERALL: ${verdict}
LIMITATION: ${caveat}

${VOICE}
- Tone for this post: ${tone}.

WRITE A 7-SLIDE CAROUSEL
- "hooks": 5 different cover lines for slide 1, one of each type: a question, a number, a contradiction ("You think X. The data says Y."), an accusation aimed at the reader's own habit, and a tiny scene. Each must make someone stop scrolling and each must be true.
- "reveal": the single most surprising fact, stated plainly. Put its tag in "facts", e.g. ["F1"].
- "explain": what is actually happening, in simple cause-and-effect language. Tag the facts used.
- "matters": why this changes how the reader should see their own day. You may interpret, but say it as interpretation ("That may be why…").
- "example": one ordinary moment the reader will recognise from their own life — a specific place, time, object. No invented statistics. "facts" can be empty.
- "question": a final question about the reader's own life that stays with them. "body" is one short line or empty.
- "stat": the one number worth showing huge on a slide: "value" (like "23 minutes" or "40%"), "label" (what it measures, max 12 words), "fact" (its tag). The value must appear in that fact.
- "caption": 3 short paragraphs for the Instagram caption: the idea in one line; what the research found (with the limitation, honestly); a question that invites comments. No hashtags here.
- "hashtags": 8 to 12, lowercase, no # sign.
- "images": 3 or 4 photo ideas for backgrounds — real places, objects, hands, silhouettes, empty rooms, screens. Never a recognisable face.
- "title": a 3 to 7 word working title.
${avoid.length ? `\nDo not reuse these earlier headlines: ${avoid.slice(0, 12).map((a) => `"${a}"`).join('; ')}\n` : ''}
Return JSON only.`;
  return { system, user, schema: CAROUSEL_SCHEMA, schemaName: 'carousel' };
}
