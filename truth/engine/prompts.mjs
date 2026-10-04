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

export function sourceBlock(sources, { maxChars = 1100, digest = null } = {}) {
  return sources.map((s, i) => `[${s.id || 'S' + (i + 1)}] ${TYPE_LABEL[s.type] || 'STUDY'} · ${s.year || 'n.d.'} · ${s.venue || s.provider}${s.citedBy ? ` · cited by ${s.citedBy} papers` : ''}\nTitle: ${s.title}\nText: ${digest ? digest(s.abstract || s.text || '', maxChars) : truncate(s.abstract || s.text || '', maxChars)}`).join('\n\n');
}

// ------------------------------------------------------------------ 1. evidence extraction
export function claimsSchema(tags) {
  return { type: 'object', additionalProperties: false, required: ['claims', 'supports', 'angle', 'verdict', 'caveat'],
    properties: {
      claims: { type: 'array', maxItems: 7, items: { type: 'object', additionalProperties: false, required: ['claim', 'source', 'quote', 'surprise'],
        properties: { claim: { type: 'string' }, source: tags?.length ? { type: 'string', enum: tags } : { type: 'string' }, quote: { type: 'string' }, surprise: { type: 'integer', minimum: 1, maximum: 5 } } } },
      supports: { type: 'string', enum: ['yes', 'partly', 'no'] }, angle: { type: 'string' }, verdict: { type: 'string' }, caveat: { type: 'string' },
    } };
}

export function claimsPrompt({ topic, angle, sources, digest = null }) {
  const system = 'You are the research desk of THE TRUTH, a publication that shows people how the modern world really works. You are strict: you only report what the supplied sources say. You never add facts, numbers, names or dates from memory.';
  const user = `TOPIC: ${topic}
PROPOSED ANGLE: ${angle}

SOURCES — the only facts you may use:

${sourceBlock(sources, { digest })}

TASK
1. Work out what these sources actually show. Evidence that contradicts the proposed angle matters most: never leave it out.
2. Pick the 4 to 7 most concrete findings. For each one give:
- "claim": ONE plain-English sentence a 14-year-old would understand, saying only what that source found. Copy every number exactly as the source prints it. Write "is linked to" for observational studies; use "causes", "makes", "reduces" or "improves" only when the source is an experiment, a randomized trial, or a meta-analysis of experiments.
- "source": the tag of the source it comes from.
- "quote": the exact words from that source's Text that prove the claim — 8 to 40 words, copied character for character, no paraphrasing.
- "surprise": 1 to 5 — how much it contradicts what most people assume.
3. "supports": does the evidence support the proposed angle? "yes", "partly" or "no".
4. "angle": one sentence stating the most interesting thing that is TRUE according to these sources. If the evidence is mixed, or contradicts the proposed angle, the angle must say so.
5. "verdict": one honest sentence on what the evidence shows overall. "caveat": one sentence on the most important limitation.

Rules: no facts, numbers, names or dates from memory. Skip findings that are vague, obvious, or only about methods. Never state the same finding twice. If the sources say nothing useful about the topic, return an empty "claims" list.

Return JSON only.`;
  return { system, user, schema: claimsSchema(sources.map((s, i) => s.id || 'S' + (i + 1))), schemaName: 'evidence' };
}

// ------------------------------------------------------------------ 2. carousel writing
export function carouselSchema(tags) {
  const tag = tags?.length ? { type: 'string', enum: tags } : { type: 'string' };
  const slide = () => ({ type: 'object', additionalProperties: false, required: ['headline', 'body', 'facts'], properties: { headline: { type: 'string' }, body: { type: 'string' }, facts: { type: 'array', maxItems: 3, items: tag } } });
  return { type: 'object', additionalProperties: false, required: ['reveal', 'explain', 'matters', 'example', 'question', 'stat', 'hooks', 'caption', 'hashtags', 'images', 'title'],
    properties: {
      reveal: slide(), explain: slide(), matters: slide(),
      example: { type: 'object', additionalProperties: false, required: ['headline', 'body'], properties: { headline: { type: 'string' }, body: { type: 'string' } } },
      question: { type: 'object', additionalProperties: false, required: ['headline', 'body'], properties: { headline: { type: 'string' }, body: { type: 'string' } } },
      stat: { type: 'object', additionalProperties: false, required: ['value', 'label', 'fact'], properties: { value: { type: 'string' }, label: { type: 'string' }, fact: tag } },
      hooks: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['text', 'type'], properties: { text: { type: 'string' }, type: { type: 'string', enum: ['question', 'contradiction', 'accusation', 'scene', 'number', 'statement'] } } } },
      caption: { type: 'string' }, hashtags: { type: 'array', minItems: 8, maxItems: 12, items: { type: 'string' } }, images: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } }, title: { type: 'string' },
    } };
}

export const VOICE = `VOICE
- A documentary narrator: calm, exact, a little cold. The unease comes from the facts, never from adjectives.
- Talk to one person: "you", present tense. Short sentences. Plain words. Concrete nouns you can picture.
- Sentence case everywhere. No exclamation marks, no emojis, no hashtags inside slides, no "Did you know".
- Banned words: shocking, mind-blowing, insane, crazy, secret, hack, game-changer, wake up, sheeple.
- Never promise more than the evidence shows. If a fact is "linked to", it stays "linked to". If the evidence is mixed, say it is mixed.

LENGTH
- Headlines and hooks: 4 to 12 words. Bodies: 15 to 40 words. One idea per slide.`;

export function carouselPrompt({ topic, angle, style, facts, verdict, caveat, supports = 'yes', intensity = 2, avoid = [], feedback = '' }) {
  const st = STYLES[style] || STYLES.uncomfortable; const hasNumber = facts.some((f) => /\d/.test(f.claim));
  const system = `You are the head writer of THE TRUTH, an Instagram publication that exposes the hidden forces shaping people's minds, behaviour and society. Series: "${st.name}" — ${st.about}. Every factual statement you write must come from the VERIFIED FACTS you are given.`;
  const tone = ['measured and curious', 'direct and unsettling', 'stark and confrontational (still accurate)'][Math.max(0, Math.min(2, intensity - 1))];
  const user = `TOPIC: ${topic}
ANGLE (what the evidence really shows): ${angle}

VERIFIED FACTS — the only source for anything factual:
${facts.map((f) => `[${f.id}] ${f.claim} (${f.label})`).join('\n')}

WHAT THE EVIDENCE SAYS OVERALL: ${verdict}
LIMITATION: ${caveat}
${supports !== 'yes' ? 'THE EVIDENCE IS MIXED OR CONTESTED. The post must say so plainly on the reveal or explain slide. Do not present the contested finding as settled.\n' : ''}
${VOICE}
- Tone for this post: ${tone}.

WRITE THE CAROUSEL
- "reveal": the single most surprising fact, stated plainly. List the tags of the facts you used in "facts".
- "explain": what is actually going on, in simple words, using only the facts.
- "matters": why this changes how the reader should see their own day. This is interpretation, so phrase it as interpretation ("That may be why…").
- "example": one ordinary moment the reader will recognise from their own life — a specific place, time of day, object. No statistics and no study results in it.
- "question": "headline" is one closing question about the reader's own life that stays with them. "body" is empty, or one short line.
- "stat": the one figure worth showing huge. "value" is a number with its unit, copied exactly from one fact; "label" says what it measures in at most 12 words; "fact" is that fact's tag. ${hasNumber ? '' : 'None of the facts contains a number, so set "value" to the two or three most important words of the key finding instead.'}
- "hooks": 5 different cover lines, each true to the facts: one question, one contradiction (what you assume, then what the evidence says), one accusation aimed at the reader's own habit, one tiny scene, and one ${hasNumber ? 'number (using a figure from the facts)' : 'plain statement'}.
- "caption": 3 short paragraphs for the Instagram caption: the idea in one line; what the research found, including the limitation, honestly; a question that invites comments.
- "hashtags": 8 to 12, lowercase, no spaces, no # sign.
- "images": 3 or 4 ideas for dark, moody photographs: real places, objects, hands, silhouettes, empty rooms, screens. Never a recognisable face.
- "title": a working title of 3 to 7 words.

HARD RULES
- Never write a number that is not in the facts. Never invent a study, a name or a term.
- Never put tags such as [F1] inside headlines, bodies, hooks or the caption. Tags belong only in the "facts" lists and in "stat.fact".
${avoid.length ? `- Do not reuse these earlier headlines: ${avoid.slice(0, 12).map((a) => `"${a}"`).join('; ')}\n` : ''}${feedback ? `\nYOUR LAST DRAFT HAD THESE PROBLEMS — fix every one:\n${feedback}\n` : ''}
Return JSON only.`;
  return { system, user, schema: carouselSchema(facts.map((f) => f.id)), schemaName: 'carousel' };
}
