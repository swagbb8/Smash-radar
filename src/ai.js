// OPTIONAL AI polish. Off unless ANTHROPIC_API_KEY is set. The radar works fully without it.
// Rewrites summary + "why it matters" for new stories using ONLY the text the source provided.
import { whyItMatters } from './classify.js';

const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';

export async function aiEnrich(stories) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !stories.length) return 0;
  const batch = stories.filter((s) => !s.aiEnriched && (s.summary || '').length > 40).slice(0, Number(process.env.AI_LIMIT || 15));
  if (!batch.length) return 0;
  const payload = batch.map((s) => ({ id: s.id, headline: s.title, source_text: s.summary, category: s.category, brands: s.brands, location: s.location?.places || null }));
  const prompt = `You write for SMASH NEWS, a personal news radar for a reader in DuPage County, Illinois.
For each item, write:
- "summary": 1–2 plain sentences restating ONLY facts present in headline/source_text. Never add facts, numbers, or speculation.
- "why": one short sentence on why it matters to a regular consumer / local resident.
Return ONLY a JSON array of {"id","summary","why"}.

${JSON.stringify(payload)}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
  const data = await res.json();
  const text = data.content?.map((c) => c.text || '').join('') || '';
  const json = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  let n = 0;
  for (const r of json) {
    const s = batch.find((x) => x.id === r.id);
    if (!s || !r.summary) continue;
    s.summary = String(r.summary).slice(0, 420);
    s.whyItMatters = String(r.why || s.whyItMatters || whyItMatters(s)).slice(0, 240);
    s.aiEnriched = true;
    n++;
  }
  return n;
}
